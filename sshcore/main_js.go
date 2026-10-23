//go:build js && wasm

package main

import (
	"encoding/base64"
	"encoding/json"
	"errors"
	"io"
	"net"
	"sync"
	"syscall/js"
	"time"
)

func await(p js.Value) (js.Value, error) {
	ch := make(chan struct{})
	var v js.Value
	var err error
	ok := js.FuncOf(func(_ js.Value, a []js.Value) any {
		if len(a) > 0 {
			v = a[0]
		}
		close(ch)
		return nil
	})
	bad := js.FuncOf(func(_ js.Value, a []js.Value) any {
		err = errors.New("LAN transport failed")
		if len(a) > 0 {
			err = errors.New(a[0].String())
		}
		close(ch)
		return nil
	})
	p.Call("then", ok).Call("catch", bad)
	<-ch
	ok.Release()
	bad.Release()
	return v, err
}

type bridge struct {
	id      string
	pending []byte
	once    sync.Once
	timer   *time.Timer
}

func (b *bridge) Read(p []byte) (int, error) {
	for len(b.pending) == 0 {
		v, e := await(js.Global().Get("flixSshWire").Call("read", b.id))
		if e != nil {
			return 0, e
		}
		if v.Get("data").Type() == js.TypeString {
			b.pending, e = base64.StdEncoding.DecodeString(v.Get("data").String())
			if e != nil {
				return 0, e
			}
		}
		if len(b.pending) == 0 && v.Get("closed").Bool() {
			return 0, io.EOF
		}
	}
	n := copy(p, b.pending)
	b.pending = b.pending[n:]
	return n, nil
}
func (b *bridge) Write(p []byte) (int, error) {
	for off := 0; off < len(p); {
		end := off + 65536
		if end > len(p) {
			end = len(p)
		}
		_, e := await(js.Global().Get("flixSshWire").Call("write", b.id, base64.StdEncoding.EncodeToString(p[off:end])))
		if e != nil {
			return 0, e
		}
		off = end
	}
	return len(p), nil
}
func (b *bridge) Close() error {
	b.once.Do(func() {
		if b.timer != nil {
			b.timer.Stop()
		}
		js.Global().Get("flixSshWire").Call("close", b.id)
	})
	return nil
}
func (b *bridge) LocalAddr() net.Addr  { return &net.TCPAddr{} }
func (b *bridge) RemoteAddr() net.Addr { return &net.TCPAddr{} }
func (b *bridge) SetDeadline(t time.Time) error {
	if b.timer != nil {
		b.timer.Stop()
	}
	b.timer = time.AfterFunc(time.Until(t), func() { b.Close() })
	return nil
}
func (b *bridge) SetReadDeadline(t time.Time) error  { return b.SetDeadline(t) }
func (b *bridge) SetWriteDeadline(t time.Time) error { return b.SetDeadline(t) }
func main() {
	js.Global().Set("flixSsh", js.FuncOf(func(_ js.Value, args []js.Value) any {
		request := args[0].String()
		executor := js.FuncOf(func(_ js.Value, p []js.Value) any {
			resolve := p[0]
			go func() {
				var r Request
				reply := Reply{}
				if err := json.Unmarshal([]byte(request), &r); err != nil {
					reply.Error = "Invalid SSH request"
				} else if !privateHost(r.Host) || r.Port < 1024 || r.Port > 65535 {
					reply.Error = "Invalid LAN endpoint"
				} else {
					id, e := await(js.Global().Get("flixSshWire").Call("open", r.Host, r.Port))
					if e != nil {
						reply.Error = e.Error()
					} else {
						reply = runSSH(r, &bridge{id: id.String()})
					}
				}
				raw, _ := json.Marshal(reply)
				resolve.Invoke(string(raw))
			}()
			return nil
		})
		promise := js.Global().Get("Promise").New(executor)
		executor.Release()
		return promise
	}))
	select {}
}
