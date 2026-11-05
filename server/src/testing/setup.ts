import http from 'node:http'
import type { AddressInfo, Server } from 'node:net'
import supertest from 'supertest'

// supertest starts a server for each request on a fresh port of the dual-stack wildcard (`::`), then sends the request to
// 127.0.0.1. On macOS another program can hold 127.0.0.1 on that same port number, and the request lands there instead
// ("socket hang up", a stray 501, a parse error). Sending it over IPv6 loopback reaches the server the port was taken for.
const Test = (supertest as unknown as { Test: { prototype: { serverAddress: (app: Server, path: string) => string } } }).Test
const serverAddress = Test.prototype.serverAddress
Test.prototype.serverAddress = function (this: unknown, app: Server, path: string) {
  const url = serverAddress.call(this, app, path)
  const address = app.address() as AddressInfo | null
  return address?.address === '::' ? url.replace('://127.0.0.1:', '://[::1]:') : url
}

// No pooled keep-alive sockets either: each request opens its own connection to its own server.
http.globalAgent = new http.Agent({ keepAlive: false })
