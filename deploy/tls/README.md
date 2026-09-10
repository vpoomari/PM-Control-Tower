# TLS certificates

Place your certificate files here when using the compose `tls` profile with
mounted certificates:

- `fullchain.pem` — full certificate chain
- `privkey.pem`   — private key

```
chmod 600 privkey.pem
docker compose --profile tls up -d
```

For public domains you can instead delete the `tls` line in
`deploy/Caddyfile.prod` and let Caddy obtain certificates automatically
from Let's Encrypt (ports 80/443 must be reachable).
