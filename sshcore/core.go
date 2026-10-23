package main

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"golang.org/x/crypto/ssh"
	"io"
	"net"
	"regexp"
	"strings"
	"time"
)

type Request struct {
	Host        string `json:"host"`
	Port        int    `json:"port"`
	Key         string `json:"key"`
	Passphrase  string `json:"passphrase"`
	Fingerprint string `json:"fingerprint"`
	Operation   string `json:"operation"`
	ID          string `json:"id"`
	Data        []byte `json:"data"`
}
type Reply struct {
	Fingerprint string `json:"fingerprint"`
	NeedsTrust  bool   `json:"needsTrust"`
	Message     string `json:"message"`
	Error       string `json:"error,omitempty"`
}

var safeID = regexp.MustCompile(`^[a-f0-9-]{36}$`)
var trustNeeded = errors.New("host fingerprint needs confirmation")

// The only allowed host is a literal private LAN IPv4 address. The bridge never resolves DNS.
func privateHost(host string) bool {
	ip := net.ParseIP(host)
	return ip != nil && ip.To4() != nil && (ip.IsPrivate() || ip.IsLinkLocalUnicast()) && !ip.IsLoopback()
}
func runSSH(r Request, wire net.Conn) (reply Reply) {
	defer wire.Close()
	if !privateHost(r.Host) || r.Port < 1024 || r.Port > 65535 {
		reply.Error = "Invalid LAN endpoint"
		return
	}
	wire.SetDeadline(time.Now().Add(180 * time.Second))
	cfg := &ssh.ClientConfig{User: "prisoner", Timeout: 15 * time.Second,
		HostKeyCallback: func(_ string, _ net.Addr, key ssh.PublicKey) error {
			reply.Fingerprint = ssh.FingerprintSHA256(key)
			if r.Fingerprint == "" {
				reply.NeedsTrust = true
				return trustNeeded
			}
			if r.Fingerprint != reply.Fingerprint {
				return errors.New("SSH host key changed; verify the television before trusting it again")
			}
			return nil
		},
	}
	if r.Fingerprint != "" {
		var signer ssh.Signer
		var err error
		if r.Passphrase != "" {
			signer, err = ssh.ParsePrivateKeyWithPassphrase([]byte(r.Key), []byte(r.Passphrase))
		} else {
			signer, err = ssh.ParsePrivateKey([]byte(r.Key))
		}
		if err != nil {
			reply.Error = "Cannot decrypt developer key; check the passphrase displayed by the TV"
			return
		}
		cfg.Auth = []ssh.AuthMethod{ssh.PublicKeys(signer)}
	}
	// LG developer keys/older firmware may advertise ssh-rsa only. Keep modern algorithms first.
	cfg.HostKeyAlgorithms = []string{ssh.KeyAlgoED25519, ssh.KeyAlgoECDSA256, ssh.KeyAlgoRSASHA256, ssh.KeyAlgoRSASHA512, ssh.KeyAlgoRSA}
	conn, channels, requests, err := ssh.NewClientConn(wire, net.JoinHostPort(r.Host, fmt.Sprint(r.Port)), cfg)
	if err != nil {
		if !reply.NeedsTrust {
			reply.Error = err.Error()
		}
		return
	}
	client := ssh.NewClient(conn, channels, requests)
	defer client.Close()
	if r.Operation == "probe" {
		reply.Message = "Developer SSH authenticated"
		return
	}
	if r.Operation != "install" || !safeID.MatchString(r.ID) || len(r.Data) < 8 || len(r.Data) > 64*1024*1024 || !bytes.HasPrefix(r.Data, []byte("!<arch>\n")) {
		reply.Error = "Invalid IPK request"
		return
	}
	path := "/media/developer/temp/flix-" + r.ID + ".ipk"
	defer func() {
		s, e := client.NewSession()
		if e == nil {
			defer s.Close()
			_ = s.Run("rm -f " + path)
		}
	}()
	upload, err := client.NewSession()
	if err != nil {
		reply.Error = err.Error()
		return
	}
	upload.Stdin = bytes.NewReader(r.Data)
	err = upload.Run("mkdir -p /media/developer/temp && cat > " + path)
	upload.Close()
	if err != nil {
		reply.Error = "IPK transfer failed: " + err.Error()
		return
	}
	session, err := client.NewSession()
	if err != nil {
		reply.Error = err.Error()
		return
	}
	defer session.Close()
	payload, _ := json.Marshal(map[string]any{"id": "com.ares.defaultName", "ipkUrl": path, "subscribe": true})
	out, err := session.StdoutPipe()
	if err != nil {
		reply.Error = err.Error()
		return
	}
	if err = session.Start("luna-send-pub -i -f luna://com.webos.appInstallService/dev/install '" + string(payload) + "'"); err != nil {
		reply.Error = err.Error()
		return
	}
	decoder := json.NewDecoder(io.LimitReader(out, 128*1024))
	for {
		var status struct {
			ReturnValue *bool  `json:"returnValue"`
			ErrorText   string `json:"errorText"`
			Details     struct {
				State  string `json:"state"`
				Reason string `json:"reason"`
			} `json:"details"`
		}
		if err = decoder.Decode(&status); err != nil {
			reply.Error = "TV did not confirm installation: " + err.Error()
			return
		}
		state := strings.ToUpper(status.Details.State)
		if status.ReturnValue != nil && !*status.ReturnValue || strings.Contains(state, "FAILED") {
			reply.Error = "LG installation rejected: " + status.Details.Reason + " " + status.ErrorText
			return
		}
		if state == "INSTALLED" || strings.HasPrefix(state, "SUCCESS") {
			reply.Message = "LG confirmed IPK installed"
			return
		}
	}
}
