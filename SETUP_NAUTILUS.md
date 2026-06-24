# Walnut — Nautilus (AWS Nitro) setup runbook

This follows the **official Sui Nautilus guide** (https://docs.sui.io/sui-stack/nautilus/using-nautilus)
step-for-step, adapted to Walnut. The build loop produces the Walnut enclave app + Move package;
this runbook is the AWS-side work only you can do (it needs your AWS account + a real attestation).

Walnut is a Nautilus **app** named `walnut`:
- `move/enclave/` — the stock Nautilus enclave package (config + PCRs + pubkey registration). **Unmodified.**
- `move/walnut/` — our app Move logic (`AgentNFT`, ERC-7857 fns) using the enclave package's
  `enclave::verify_signature`. Module `walnut`, OTW `WALNUT`.
- `src/nautilus-server/src/apps/walnut/mod.rs` — our enclave logic implementing `process_data`
  (chat: decrypt config in-enclave → run the small model → sign; and re-encrypt for transfer/clone).
- `src/nautilus-server/src/apps/walnut/allowed_endpoints.yaml` — outbound hosts the enclave may reach
  via the parent: the Sui testnet fullnode, the Walrus aggregator/upload-relay, and the Seal key servers.

## Prerequisites
- Install **AWS CLI v2**, **Rust + cargo**, **Make**, **Sui CLI**.
- `git clone` the **Nautilus repo** (MystenLabs/nautilus); the loop adds the `walnut` app into it.
- Sui `PRIV_KEY` funded on testnet; WAL for Walrus.

## Step 1–3: AWS account + SSO
```bash
aws --version                       # must be 2.x
aws configure sso                   # SSO start URL + region us-east-1
# log in via browser, choose the account + role (AdministratorAccess for the walkthrough only;
# scope to least-privilege EC2 + Nitro Enclaves + Secrets Manager for anything real)
```

## Step 4–5: SSH key pair + credentials env
```bash
aws ec2 create-key-pair --key-name walnut-ec2 --query 'KeyMaterial' --output text \
  --region us-east-1 > ~/.ssh/walnut-ec2.pem
chmod 400 ~/.ssh/walnut-ec2.pem
export KEY_PAIR=walnut-ec2

aws configure export-credentials --profile AdministratorAccess-<acct> --format env > ~/aws-temp-creds.sh
source ~/aws-temp-creds.sh
aws sts get-caller-identity          # confirm identity
```

## Step 6–7: Configure the enclave (provisions EC2 + builds)
From the Nautilus repo root, run the provisioning script with our app name:
```bash
sh configure_enclave.sh walnut
# If not in us-east-1: export REGION=<region> and AMI_ID=<amazon-linux-ami> first.
# It launches a Nitro-enabled EC2, allocates the enclave, wires HTTP forwarding for the hosts in
# allowed_endpoints.yaml, and exposes health_check / get_attestation / process_data.
```
Save the printed **Instance ID** and **Public IP**. Wait 2–3 min for init.

## Step 8–9: Copy your code to EC2
`configure_enclave.sh` edits `src/nautilus-server/run.sh` and `expose_enclave.sh`; sync the repo up:
```bash
rsync -avz -e "ssh -i ~/.ssh/walnut-ec2.pem" ./ ec2-user@<public-ip>:~/nautilus/
```
> Walnut's `allowed_endpoints.yaml` must list the Sui fullnode, the Walrus aggregator/upload-relay,
> and both Mysten Seal testnet key servers. Changing it requires re-running `configure_enclave.sh`
> (the list is compiled into the enclave build → into the PCRs).

## Step 10: Build + run the enclave on EC2
```bash
ssh -i ~/.ssh/walnut-ec2.pem ec2-user@<public-ip>
cd nautilus/
make ENCLAVE_APP=walnut && make run     # production build (real PCRs); use `make run-debug` for dev
sh expose_enclave.sh                     # exposes port 3000
# sanity:
curl -X GET  http://<public-ip>:3000/health_check
curl -X GET  http://<public-ip>:3000/get_attestation
```
Record `out/nitro.pcrs` → `PCR0/PCR1/PCR2`. (Optional: front with an ALB + ACM TLS + Route53 for HTTPS.)

## Step 11: Register the enclave on-chain
```bash
# deploy the stock enclave package
cd move/enclave && sui move build && sui client publish     # -> ENCLAVE_PACKAGE_ID
# deploy the Walnut app package
cd ../walnut   && sui move build && sui client publish      # -> APP_PACKAGE_ID, CAP_OBJECT_ID, ENCLAVE_CONFIG_OBJECT_ID

export ENCLAVE_PACKAGE_ID=0x...  APP_PACKAGE_ID=0x...  CAP_OBJECT_ID=0x...  ENCLAVE_CONFIG_OBJECT_ID=0x...
export MODULE_NAME=walnut OTW_NAME=WALNUT ENCLAVE_URL=http://<public-ip>:3000
export PCR0=...  PCR1=...  PCR2=...

# pin the measured build, then register the enclave's attested public key
sui client call --function update_pcrs --module enclave --package $ENCLAVE_PACKAGE_ID \
  --type-args "$APP_PACKAGE_ID::$MODULE_NAME::$OTW_NAME" \
  --args $ENCLAVE_CONFIG_OBJECT_ID $CAP_OBJECT_ID 0x$PCR0 0x$PCR1 0x$PCR2

sh ../../register_enclave.sh $ENCLAVE_PACKAGE_ID $APP_PACKAGE_ID $ENCLAVE_CONFIG_OBJECT_ID \
  $ENCLAVE_URL $MODULE_NAME $OTW_NAME                       # -> ENCLAVE_OBJECT_ID
```
Put `ENCLAVE_PACKAGE_ID`, `APP_PACKAGE_ID`, `ENCLAVE_CONFIG_OBJECT_ID`, `ENCLAVE_OBJECT_ID`, and
`ENCLAVE_URL` into `walnut.config.json` / `.env.local` so the app + scripts use them.

## Step 12: Stop the instance when idle (AWS bills ~$0.19/hr)
```bash
aws ec2 stop-instances  --instance-ids <instance-id>
aws ec2 start-instances --instance-ids <instance-id>   # later; then ssh in, make ENCLAVE_APP=walnut, make run, expose_enclave.sh
```

## Dev mode (no AWS, for local iteration only)
`make run-debug` runs the server anywhere with **all-zero PCRs** and a deterministic injected key.
Register once with all-zero PCRs and reuse for development.
**danger:** all-zero PCRs give NO attestation guarantee — never use in production / for the real demo.

## Walnut-specific notes
- **`process_data` multiplexes** our two operations by payload type: `{"op":"chat", nftId, sessionKeyOrToken, message}` and `{"op":"reencrypt", nftId, to, ...}`. Inference uses the small model **baked into the enclave image** (reproducible build ⇒ stable PCRs).
- The enclave reads the NFT (Sui), the encrypted config blob (Walrus), and the Seal key (Seal key servers) **only through the parent's HTTP forwarding** (hosts pinned in `allowed_endpoints.yaml`).
- On-chain, Walnut's `secure_transfer` / `clone` / provenance receipts call `enclave::verify_signature` against the registered `ENCLAVE_OBJECT_ID` — so only outputs from this exact attested build are accepted.

## Verify the TEE paths (what the build loop can't)
- `register_enclave` recorded your PCRs + pubkey on-chain.
- `/process_data` chat returns an **enclave-signed** reply for the owner; non-owners are refused.
- A Kiosk sale flips access; `secure_transfer` accepts only a real enclave signature.
