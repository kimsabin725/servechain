# DoraHacks BUIDL submission: ServeChain (BLI Legal Tech Hackathon 2)

## Name

ServeChain

## Track

- Primary: LegalTech & RegTech

## One-line intro

Some courts have ordered service by NFT. Proving you complied with the order is still manual. ServeChain does both: serve, then build a verifiable case file.

## Short description (for the card)

Some courts have ordered service by NFT. Proving you complied with the order is still manual. ServeChain does both: serve, then build a verifiable case file.

## Long description

### The problem

When a defendant is known only by a crypto wallet address, some courts have ordered service by airdrop: by an airdropped token in LCX AG v 1.274M U.S. Dollar Coin, 2022 NY Slip Op 32834[U] (the 2025 decision describes a token airdrop; the OAG memorandum in the same filing calls it service by NFT), and by NFT in Meghji v Wallet Owner (In re Celsius Network LLC), 666 BR 28 [Bankr SD NY 2024]. These are trial-level orders, not appellate rulings. In a 2025 New York case brought by the New York Attorney General (Sup. Ct. Queens County, Index No. 700647/2025, reported as 2025 NY Slip Op 25143, official text not retrieved), the court ordered the plaintiff to serve the full set of papers within 120 days, by NFTs hyperlinked to a website with the papers, to three named wallets, and then to file an affidavit of service, with service complete on filing. That order was granted on an unopposed motion.

The service method is new. In that case, the proof around it was not. At the motion stage, delivery was shown with explorer and NFT-platform webpages (Etherscan, Tronscan) attached to an affirmation. Nothing ties each page to the order condition it relates to, flags which conditions have no evidence yet, records which exact papers were served, or computes the response deadline.

### What ServeChain does

A five-step walkthrough that replays the order on Sepolia. It is a replay of a public New York Attorney General case; the author is not a party to it. The order names two TRON wallets; this tool writes only to EVM chains, so in this replay they are served on Sepolia stand-ins.

1. **Impracticability**: real defendant wallet activity (read only) beside the contact attempts the court relied on.
2. **Conditions**: the order becomes a checklist with exact quotes and page numbers; its hash is fixed on-chain when the case is opened.
3. **Serve**: the papers are hashed; one soulbound notice NFT per wallet per condition is minted with that hash and the papers' URL fixed in `tokenURI`; each transaction is linked to a condition as "Evidence linked (not a compliance determination)". Unattributed NFTs already seen on the real wallets in July 2025 are shown as context only.
4. **Deadline**: the filer declares the affidavit filing time; the registry records it only after every service condition has linked evidence and not earlier than the last service evidence, then stores filedAt + 720 hours (30 days, CPLR 320(a) / 3012(c); the order did not set a different period). The app and CLI show the deadline as a New York calendar date (filing date + 30 days, through the end of that day), marked as an estimate: weekend and holiday rules (GCL §25-a) are not applied, and it is meaningful only if service was valid under the order. The on-chain value is labelled "on-chain timestamp (filedAt + 720 h)" and can fall one day off the calendar date across a DST change.
5. **Compliance summary & verify**: one PDF, the compliance summary (attachment for counsel), for counsel preparing an affidavit of service or a default motion (impracticability, condition-by-condition record, deadlines and activity as context only). It is not a court-filed exhibit. Its SHA-256 is anchored on-chain and checked by a browser or CLI verifier. No server of ours is needed to read the chain; the browser check trusts the case file served with the page, and the CLI can pin the issuer.

### What it shows

The post-deadline activity snapshot is shown via local replay (on Sepolia it is pending until the registry's snapshot gate opens at filedAt + 720 h, 2026-11-24 08:46 UTC). On Sepolia, all five conditions of the order have on-chain evidence linked (not a compliance determination), and the published compliance summary verifies as MATCH ("Live (2 RPCs agree)") while a copy with one byte changed returns MISMATCH. The served bundle and the affidavit also return MATCH, and with the RPC blocked the verifier returns MATCH (offline) from the bundled event log. The case id is `keccak256(abi.encode(handler, caseRef))`, and the verifier re-derives it from the `CaseRefBound` event.

### Who it is for

Plaintiff's counsel and process servers in digital-asset fraud and recovery cases; government enforcement offices, such as a state Attorney General's office; bankruptcy trustees pursuing transfers to unidentified wallets. Hypothesis: a per-case fee for counsel, or a tool licensed to process-serving firms. No lawyer review or user interviews yet; next step: practitioner interviews (not yet done).

### Why blockchain

1. Service has to happen on-chain because the defendant only exists on-chain. The notice locks the hash of the papers, so it shows what was served.
2. Anchoring the compliance record is added value, not a legal requirement: the filer cannot quietly change their own record, and the other side can check it against the chain (the browser check trusts the case file served with the page; the CLI can pin the issuer). On-chain gives public reading, ordering and a non-transferable service NFT; it does not prove the facts behind a record, and a proof of time alone could come from an RFC 3161 timestamp.

### What it does not claim

For counsel's review. It does not determine compliance. It does not prove that a defendant received or read the papers. Wallet activity is context only, not evidence of notice. It does not decide whether default-judgment requirements are met (other requirements such as an SCRA affidavit are not covered). It is not legal advice.

### Limitations

The affidavit filing time is declared by the filer and cannot be proven by the chain. Deadlines are estimates (calendar days from the New York filing date; GCL §20 and §25-a not read, so weekend and holiday roll-forward is not applied). The contract stores filedAt + 720 h, which can differ from the calendar date by one day across a DST change, and its snapshot gate opens at filedAt + 720 h (in the demo 2026-11-24 08:46 UTC), earlier than the end of the last calendar day; counsel should treat the end of the New York day as the deadline. The registry refuses to record service as complete until every service condition has linked evidence, and refuses a filing date earlier than the last service evidence. It still cannot check that the evidence is true. The snapshot step is shown via local replay; on Sepolia it is pending until 2026-11-24 08:46 UTC. The verifier trusts the contract addresses in case.json, condition links are the handler's declaration, and live checks rely on logs from public RPCs (two must agree; the browser verifier does not compare against a deployments file, pin the issuer or recompute the snapshot root). Writes are EVM only; TRON wallets are read, not served. Duplicate service per recipient is rejected; registry and notice contract are linked by the scripts, not on-chain.

### Built with

Solidity 0.8.28 and Foundry (OpenZeppelin ERC-721), Node.js and viem, React and Vite (static site, no backend), headless Chromium for the compliance summary PDF. Two contracts: `ServiceNotice721` and `CaseFileRegistry`.

### Data and ethics

Case documents are public records published by the New York Attorney General; court PDFs are linked, not redistributed. Real defendant wallets are read only; writes are restricted in code to anvil and Sepolia and go to labelled stand-in wallets. Synthetic contact details, service papers and sample affidavit data (to be sworn by the person who served) are labelled on screen. No victim names or contact details are used; public on-chain counterparty addresses appear in the activity cache.

## Links

| Item | Link |
|---|---|
| Live demo | https://kimsabin725.github.io/servechain/ |
| Demo video | https://youtu.be/wJTnQijZ2Lc |
| GitHub repository | https://github.com/kimsabin725/servechain |
| Pitch deck (PDF) | https://github.com/kimsabin725/servechain/blob/main/docs/deck.pdf |
| ServiceNotice721 (Sepolia) | https://sepolia.etherscan.io/address/0xA7bA126d3cE7E90155CB11b3EF20d426B8a84001 |
| CaseFileRegistry (Sepolia) | https://sepolia.etherscan.io/address/0xB2a07aEF698cC158180635dD252E5477049C1ac2 |
| Compliance summary anchor tx | https://sepolia.etherscan.io/tx/0xd6209e973abdfae95561e075d3c0fdeba05ad7e19abeb47d92f8d8eafaa27761 |
| Source court order (public) | https://ag.ny.gov/sites/default/files/court-filings/people-v-digital-wallet-0xd7648fffa48e06b0107435a966f3f1e9dbe10b7d-decision-and-pleadings-2025.pdf |

Earlier Sepolia deployments (0x5D39…/0xD712… and 0x7878…/0xB7a0…) are superseded.

## Team

Sabin Kim, solo builder. Strategic planning in financial services.
