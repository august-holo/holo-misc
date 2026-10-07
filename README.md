# holo-misc

https://misc.holotekt.com

```
CloudFront (misc.holotekt.com)
  ├─ /*      → S3            static Next.js export        web/
  └─ /api/*  → EC2 t4g.nano  Rust (axum) under systemd    api/
                               └─ verifies Cognito access tokens
```

| Directory | Contents |
|---|---|
| `api/` | Rust backend. One binary; each domain is a module under `src/modules/` |
| `web/` | Next.js (TypeScript), exported as static files |
| `infra/` | Terraform for everything in AWS |
| `scripts/` | Deploy scripts, shared by CI and manual deploys |

## Deploying

Pushing to `main` deploys the API and the site through GitHub Actions, each only when its
own files changed. The workflows
assume an IAM role via OIDC; there are no AWS credentials stored in GitHub. The role can
only upload builds, sync the site bucket, invalidate CloudFront, and run the one fixed
SSM deploy document on the instance.

The same scripts work from a laptop with AWS credentials:

```sh
scripts/deploy-api.sh
scripts/deploy-web.sh
```

## Infrastructure

Terraform is applied locally, never from CI. State is in S3.

```sh
cd infra
terraform init
terraform apply
```

Terraform writes `.github/deploy.env` and `web/.env`. They hold identifiers, not secrets,
and are committed so CI needs no configuration in GitHub.

## Users

Sign-up is closed. Create a user, who then receives a temporary password by email:

```sh
aws cognito-idp admin-create-user \
  --user-pool-id "$(terraform -chdir=infra output -raw user_pool_id)" \
  --username someone@example.com
```

## Local development

```sh
cd api && DEV_USER_SUB=local cargo run   # http://127.0.0.1:8080, auth bypassed
cd web && npm run dev                    # http://localhost:3000, proxies /api to the above
```

If port 3000 is taken, run `npm run dev -- -p 3100` and start the API with
`ALLOWED_ORIGINS=http://localhost:3100`, since sockets are only accepted from known origins.

## Solarpunk terrarium

https://misc.holotekt.com/solarpunk-terrarium, open to anyone.

Sunhollow is a town that builds itself. It is simulated in the API
(`api/src/modules/terrarium/sim`) and drawn in the browser
(`web/app/solarpunk-terrarium/engine`), which receives it over a WebSocket at
`/api/solarpunk-terrarium/ws`.

- One world is shared by everyone watching. It stands still while nobody is.
- At most 20 viewers, and 4 from one address.
- A town lasts 100 of its days (about five hours of watching), then a new one begins.
  Restarting the API also begins a new one, so the API is only deployed when it changes.
- The server sends two kinds of compressed JSON snapshot: `world` (the city, every four
  seconds or when something is built) and `frame` (what moves, five times a second).
  Both are complete, so a viewer that misses some is correct again after the next.
  Changing their shape means bumping `PROTOCOL` in `snapshot.rs` and `view.ts` together.

`cargo test --release growth_report -- --ignored --nocapture` prints how towns develop
from several seeds, along with the cost of a tick and the size of the messages.

## Access to the instance

There is no SSH. Use Session Manager:

```sh
aws ssm start-session --target "$(terraform -chdir=infra output -raw instance_id)"
journalctl -u holo-misc -f
```
