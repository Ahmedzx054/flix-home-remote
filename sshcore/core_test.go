package main

import (
	"bytes"
	"crypto/rand"
	"crypto/rsa"
	"encoding/json"
	"encoding/pem"
	"fmt"
	"golang.org/x/crypto/ssh"
	"io"
	"net"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
)

type tvFixture struct {
	address, key, fingerprint string
	auth                      atomic.Int32
	mu                        sync.Mutex
	uploads                   [][]byte
	cleanup                   int
}

func fixture(t *testing.T) *tvFixture {
	t.Helper()
	host, _ := rsa.GenerateKey(rand.Reader, 2048)
	signer, _ := ssh.NewSignerFromKey(host)
	client, _ := rsa.GenerateKey(rand.Reader, 2048)
	block, _ := ssh.MarshalPrivateKeyWithPassphrase(client, "fixture", []byte("123456"))
	f := &tvFixture{key: string(pem.EncodeToMemory(block)), fingerprint: ssh.FingerprintSHA256(signer.PublicKey())}
	config := &ssh.ServerConfig{PublicKeyCallback: func(_ ssh.ConnMetadata, key ssh.PublicKey) (*ssh.Permissions, error) {
		f.auth.Add(1)
		pub, _ := ssh.NewPublicKey(&client.PublicKey)
		if !bytes.Equal(pub.Marshal(), key.Marshal()) {
			return nil, fmt.Errorf("wrong key")
		}
		return nil, nil
	}}
	config.AddHostKey(signer)
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	f.address = ln.Addr().String()
	t.Cleanup(func() { ln.Close() })
	go func() {
		for {
			wire, err := ln.Accept()
			if err != nil {
				return
			}
			go func() {
				conn, channels, requests, err := ssh.NewServerConn(wire, config)
				if err != nil {
					wire.Close()
					return
				}
				defer conn.Close()
				go ssh.DiscardRequests(requests)
				for open := range channels {
					if open.ChannelType() != "session" {
						open.Reject(ssh.UnknownChannelType, "session only")
						continue
					}
					ch, reqs, _ := open.Accept()
					go func() {
						defer ch.Close()
						for req := range reqs {
							if req.Type != "exec" {
								req.Reply(false, nil)
								continue
							}
							var cmd struct{ Command string }
							ssh.Unmarshal(req.Payload, &cmd)
							req.Reply(true, nil)
							if strings.HasPrefix(cmd.Command, "mkdir ") {
								data, _ := io.ReadAll(ch)
								f.mu.Lock()
								f.uploads = append(f.uploads, data)
								f.mu.Unlock()
							} else if strings.HasPrefix(cmd.Command, "rm -f ") {
								f.mu.Lock()
								f.cleanup++
								f.mu.Unlock()
							} else if strings.HasPrefix(cmd.Command, "luna-send-pub ") {
								f.mu.Lock()
								data := f.uploads[len(f.uploads)-1]
								f.mu.Unlock()
								status := `{"returnValue":true,"details":{"state":"INSTALLING"}}` + "\n"
								if bytes.Contains(data, []byte("reject")) {
									status += `{"returnValue":false,"errorText":"storage full","details":{"state":"FAILED"}}`
								} else if bytes.Contains(data, []byte("truncate")) {
									status += "{"
								} else {
									status += `{"returnValue":true,"details":{"state":"INSTALLED"}}`
								}
								io.WriteString(ch, status)
							} else {
								io.WriteString(ch, "unexpected command")
							}
							ch.SendRequest("exit-status", false, ssh.Marshal(struct{ Code uint32 }{0}))
							return
						}
					}()
				}
			}()
		}
	}()
	return f
}
func (f *tvFixture) request() Request {
	return Request{Host: "192.168.1.210", Port: 9922, Key: f.key, Passphrase: "123456", Fingerprint: f.fingerprint, Operation: "probe", ID: "33333333-3333-4333-8333-333333333333"}
}
func (f *tvFixture) call(t *testing.T, r Request) Reply {
	t.Helper()
	wire, err := net.Dial("tcp", f.address)
	if err != nil {
		t.Fatal(err)
	}
	return runSSH(r, wire)
}
func TestSSHNative(t *testing.T) {
	f := fixture(t)
	r := f.request()
	r.Fingerprint = ""
	reply := f.call(t, r)
	if !reply.NeedsTrust || reply.Fingerprint != f.fingerprint || reply.Error != "" || f.auth.Load() != 0 {
		t.Fatalf("trust failed: %+v", reply)
	}
	r = f.request()
	r.Fingerprint = "SHA256:wrong"
	if !strings.Contains(f.call(t, r).Error, "changed") {
		t.Fatal("changed host accepted")
	}
	r = f.request()
	r.Passphrase = "wrong"
	if !strings.Contains(f.call(t, r).Error, "decrypt") {
		t.Fatal("bad passphrase accepted")
	}
	r = f.request()
	if reply = f.call(t, r); reply.Message == "" || reply.Error != "" {
		t.Fatalf("auth failed: %+v", reply)
	}
	r.Operation = "install"
	r.Data = []byte("!<arch>\nfixture bytes")
	if reply = f.call(t, r); reply.Message != "LG confirmed IPK installed" || reply.Error != "" {
		t.Fatalf("install failed: %+v", reply)
	}
	f.mu.Lock()
	if !bytes.Equal(f.uploads[0], r.Data) || f.cleanup != 1 {
		t.Fatal("upload or cleanup mismatch")
	}
	f.mu.Unlock()
	r.Data = []byte("!<arch>\nreject")
	if !strings.Contains(f.call(t, r).Error, "storage full") {
		t.Fatal("rejected install reported success")
	}
	r.Data = []byte("!<arch>\ntruncate")
	if !strings.Contains(f.call(t, r).Error, "did not confirm") {
		t.Fatal("incomplete receipt accepted")
	}
	r.Data = []byte("not an IPK")
	if f.call(t, r).Error != "Invalid IPK request" {
		t.Fatal("invalid package accepted")
	}
	r = f.request()
	r.Host = "8.8.8.8"
	if f.call(t, r).Error != "Invalid LAN endpoint" {
		t.Fatal("public host accepted")
	}
}
func TestSSHWebAssembly(t *testing.T) {
	f := fixture(t)
	config := filepath.Join(t.TempDir(), "fixture.json")
	raw, _ := json.Marshal(map[string]any{"address": f.address, "request": f.request()})
	if err := os.WriteFile(config, raw, 0600); err != nil {
		t.Fatal(err)
	}
	cmd := exec.Command("node", "../tests/ssh-wasm.mjs", config)
	out, err := cmd.CombinedOutput()
	if err != nil {
		t.Fatalf("WASM test failed: %v\n%s", err, out)
	}
	t.Log(string(out))
	f.mu.Lock()
	defer f.mu.Unlock()
	if len(f.uploads) != 2 || f.cleanup != 2 {
		t.Fatalf("WASM uploads=%d cleanup=%d", len(f.uploads), f.cleanup)
	}
}
