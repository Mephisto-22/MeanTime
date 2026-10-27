# MeanTime Infrastructure

Terraform for MeanTime's AWS Dev and Prod environments.

The full guide (layout, prerequisites, bringing environments up and down, opening Dev, finding Prod's URL, and troubleshooting) is in the documentation:

- **Online:** [Infrastructure Guide](https://meantime.readthedocs.io/en/latest/infrastructure/) (or the [`dev` branch version](https://meantime.readthedocs.io/en/dev/infrastructure/))
- **In this repo:** `docs/infrastructure/index.md`

Quick reference:

```bash
cd infra/envs/dev/app                            # or envs/prod/app
terraform init -backend-config=../backend.hcl
terraform apply                                  # bring it up (Docker must be running)
terraform destroy                                # tear it down
```
