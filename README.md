# ServeChain

**Some courts have ordered service by NFT. Proving you complied with the order is still manual. ServeChain does both: serve, then build a verifiable case file.**

**Problem.** Some courts have ordered plaintiffs to serve defendants known only by a wallet address by airdropping an NFT (trial-court orders on unopposed motions). Proving that every condition of such an order was met is still done by hand with explorer and NFT-platform webpages.
**What I built.** ServeChain serves the papers as a hash-locked, non-transferable notice NFT, then turns the court order into a checklist, links each on-chain transaction to the condition it relates to, estimates the response deadline, and produces one compliance summary PDF (an attachment for counsel).
**What it shows.** Replaying a 2025 New York order on Sepolia, all five order conditions have on-chain evidence linked (not a compliance determination), and anyone can re-check the compliance summary against the chain from a browser or CLI, with no server of ours involved. The post-deadline activity snapshot is shown via local replay; on Sepolia it stays pending until the response deadline passes.
**Why blockchain, in one line.** The defendant exists only as a wallet, so service happens on-chain; anchoring the compliance record on-chain is extra, so the filer cannot quietly rewrite it (details below).

- **Live demo:** https://kimsabin725.github.io/servechain/
- **Demo video (3 min):** https://youtu.be/58pzpLuhmQc

> For counsel's review. Does not determine compliance. Not legal advice. Replay of a public New York Attorney General case; the author is not a party to it. Nothing was ever sent to the real defendant wallets; they are read only. The order names two TRON wallets; this tool writes only to EVM chains, so in this replay they are served on Sepolia stand-ins.

## Why I built this

I'm going through a lawsuit myself, and the parts that felt most fragile were the procedural ones: serving papers, tracking what the court ordered, and keeping track of deadlines. When I read how New York courts handle defendants who are known only by a wallet address, I saw the same gap: the service method is modern, but the bookkeeping around it is still manual.

## Who uses it

- **Plaintiff's counsel and process servers** in digital-asset fraud and recovery cases, where the defendant is known only by a wallet address.
- **Government enforcement offices**, for example a state Attorney General's office bringing a case like the one replayed here.
- **Bankruptcy trustees and estate representatives** pursuing transfers to unidentified wallets.

Hypothesis: a per-case fee for counsel, or a tool licensed to process-serving firms. No lawyer review or user interviews yet; next step: practitioner interviews (not yet done) with plaintiff's counsel, a process-serving firm and an enforcement office, to test the workflow and the pricing.

## How it works

The walkthrough at the live demo has the same five steps.

| Step | Screen | What happens |
|---|---|---|
| 1 | **Impracticability** | Real defendant wallet activity (read only) next to the contact attempts the court relied on. This is the showing that made NFT service necessary. |
| 2 | **Conditions** | The order's obligations become a checklist, each with its exact wording and page. The checklist hash is fixed on-chain when the case is opened. |
| 3 | **Serve** | The service papers are hashed. One soulbound notice NFT per target wallet is minted with that hash and the papers' URL fixed in its `tokenURI`. Each transaction is linked to a condition ("Evidence linked (not a compliance determination)"); conditions without a record show "No evidence linked". Replay-only evidence (deadline, stand-in targets, affidavit) carries a "replay" badge. Unattributed NFTs already seen on the real wallets in July 2025 are shown as context only, not as evidence. |
| 4 | **Deadline** | The filer declares when the affidavit of service was filed (`declaredFiledAt`). The registry derives the response deadline (+30 days, CPLR 320(a)) on-chain. The screen and the summary show it as a New York date only, marked as an estimate (counting rules not applied, meaningful only if service was valid under the order). After the deadline, a Merkle root of the wallet activity table can be anchored. |
| 5 | **Compliance summary & verify** | One PDF, the compliance summary (attachment for counsel), for counsel preparing an affidavit of service or a default motion (A: impracticability table, B: condition-by-condition record, C: deadlines and post-service activity, context only). It is not a court-filed exhibit. Its SHA-256 is anchored in the registry. Drop the PDF into the browser verifier, or run the CLI, to get MATCH or MISMATCH. "Verify now" on the first screen runs this check on the published summary. |

## Legal basis

Status: **excerpt verified** = every quoted string was returned verbatim from the official nysenate.gov page for that section; only the excerpt is checked, not the full section. **summary** = a paraphrase; any part not covered by a quote is not checked against the statute. For court documents, **read** = the document was opened and quoted, and **as cited** = the citation is copied as printed in the L1 decision and the cited decision itself was not read. Statute excerpts were retrieved from nysenate.gov on 2026-10-25 as short quotes, not full section text. Decision pages 1 to 8 are scanned; quotes from them come from an OCR text layer corrected only for obvious character errors.

| # | Point | Source | Status |
|---|---|---|---|
| L1 | *People v Unknown Parties in Ownership and/or Control of Digital Wallet Addresses*, Sup. Ct. N.Y., Queens County, Index No. 700647/2025, Hon. Karen Lin. Order signed 2025-06-09, entered 2025-06-11 (NYSCEF 21). Reported as 2025 NY Slip Op 25143 (official text not retrieved: on 2026-10-25 nycourts.gov and law.justia.com returned 403, Casetext 410, CourtListener no results, Google Scholar a captcha). Grants service under CPLR 308(5) on an unopposed motion. | [Decision and pleadings PDF](https://ag.ny.gov/sites/default/files/court-filings/people-v-digital-wallet-0xd7648fffa48e06b0107435a966f3f1e9dbe10b7d-decision-and-pleadings-2025.pdf), pp. 1, 6, 9 | read |
| L2 | Order conditions: 120 days from entry to serve (306-b extension); serve the full document set with the decision and notice of entry; by airdropping NFTs hyperlinked to a website with the papers; to Wallets 1, 2 and 3; file an affidavit of service under CPLR 306(a), and "service shall be deemed complete upon such filing". | Same PDF, p. 6 | read (OCR) |
| L3 | Impracticability showing: calls and texts to 14 numbers (Dec 6 and 9-11, 2024), 4 email addresses with 1 "delivered", wallets used April to December 2024, about $2,179,507 frozen. | Same PDF, pp. 2, 4-5 | read (OCR) |
| L4 | How service was shown at the motion stage (January 2025): a law-student intern minted the Ethereum notice through an NFT platform's shared contract and TRON notices through separate contracts, and showed delivery with explorer and NFT-platform webpages (Etherscan, Tronscan). | Same PDF, pp. 5, 69-72 | read |
| L5 | Defendant wallets: `0xD7648FffA48e06b0107435a966F3F1e9DBe10B7d` (Ethereum), `TCfr5oZp8qJJwarum6kjt4o23wTNhi1ss8` and `TDvRhqyGMW5NuZjhiAmEmYuXrSZ4bdZtmu` (TRON). | [Complaint PDF](https://ag.ny.gov/sites/default/files/court-filings/people-v-digital-wallet-0xd7648fffa48e06b0107435a966f3f1e9dbe10b7d-complaint-2025.pdf), p. 1 | read |
| L6 | Earlier orders on service to wallets: *LCX AG v 1.274M U.S. Dollar Coin*, 2022 NY Slip Op 32834[U] (Sup Ct, NY County), by token airdrop (not an NFT); *Meghji v Wallet Owner (In re Celsius Network LLC)*, 666 BR 28 [Bankr SD NY 2024], by NFT. Trial-level orders on motions no defendant opposed; none is an appellate ruling. List in [`data/precedents.json`](data/precedents.json). | Cited in the L1 decision, p. 4 | as cited |
| L7 | CPLR 306(a): proof of service must specify the papers served, the person served, and the date, time and place, and that service was made by an authorized person in an authorized manner. | [nysenate.gov/legislation/laws/CVP/306](https://www.nysenate.gov/legislation/laws/CVP/306) | excerpt verified |
| L7a | CPLR 306(d): proof is a certificate when a sheriff or other authorized public officer serves; otherwise an affidavit, signed and sworn by the person who served. The affidavit in this demo is sample data to be sworn by that person. | Same page | excerpt verified for the certificate clause; affidavit clause: summary |
| L8 | CPLR 306-b: service within 120 days after commencement; the court may extend on good cause or in the interest of justice. | [nysenate.gov/legislation/laws/CVP/306-B](https://www.nysenate.gov/legislation/laws/CVP/306-B) | excerpt verified |
| L9 | CPLR 308(5): service "in such manner as the court ... directs" when 308(1), (2) and (4) are impracticable. It has no completion rule of its own, so completion comes from the order (L2). | [nysenate.gov/legislation/laws/CVP/308](https://www.nysenate.gov/legislation/laws/CVP/308) | excerpt verified |
| L10 | CPLR 320(a): when served under 308(2) to (5), "the appearance shall be made within thirty days after service is complete". Used as: response deadline = affidavit filing + 30 days, because the order did not set a different period. | [nysenate.gov/legislation/laws/CVP/320](https://www.nysenate.gov/legislation/laws/CVP/320) | excerpt verified |
| L10a | CPLR 3012(c): when the summons and complaint are served under 308(2) to (5), "service of an answer shall be made within thirty days after service is complete." Same 30-day count for the answer; the order did not set a different period. | [nysenate.gov/legislation/laws/CVP/3012](https://www.nysenate.gov/legislation/laws/CVP/3012) | excerpt verified |
| L11 | CPLR 3215(f) (partial list): a default application must include proof of service of the summons and complaint, and proof of the facts, the default and the amount due. | [nysenate.gov/legislation/laws/CVP/3215](https://www.nysenate.gov/legislation/laws/CVP/3215) | excerpt verified |
| L12 | CPLR 3215(c): if the plaintiff does not take proceedings for a default judgment within one year after the default (not after service), the complaint is dismissed as abandoned, "unless sufficient cause is shown why"; the words after "why" were not retrieved. | Same page | excerpt verified (rest of the exception: summary) |
| L13 | Unattributed NFTs titled "Service of NY OAG Summons and Complaint…" reached all three real wallets on 2025-07-30 (sender not matched to court records; contract name on-chain: SoulBoundTest). Shown as context only; not linked to any condition. | On-chain, e.g. [Etherscan tx](https://etherscan.io/tx/0xc1663d2f20123334529ae08babaf9c64b08b5c003e07f2437891a4f90b15aba2) | read on-chain |

## What ServeChain does NOT claim

- **It does not prove that a defendant actually received or read the papers.** It shows which papers were sent, to which address, and when.
- **Wallet activity is not evidence of knowledge.** Activity after service is shown as context only.
- **It does not determine compliance.** "Evidence linked" means the handler linked a record to a condition, not that the condition is met.
- **It does not decide whether default-judgment requirements are met.** That is for counsel and the court. Other default requirements (e.g., an SCRA affidavit) are not covered.
- **It is not legal advice.** Deadlines and rule readings need a lawyer's review before use in a filing.

## Limitations

- **`declaredFiledAt` cannot be proven by the chain.** The filer enters the affidavit filing time. The chain records the declared value and the affidavit hash, not the court's acceptance.
- **Deadlines are estimates.** Plain day counts; counting rules (General Construction Law §20, §25-a weekends/holidays) were not read and are not applied, so counsel must confirm the last day. The response deadline is meaningful only if service was valid under the order.
- **The registry gates the clock, not the facts.** The registry refuses to record service as complete until every service condition has linked evidence, and refuses a filing date earlier than the last service evidence. It still cannot check that the evidence is true.
- **The snapshot step is shown via local replay.** On Sepolia the activity snapshot is pending: the registry refuses a snapshot before the response deadline (2026-11-24, New York date), and testnet time cannot be advanced, so the step is shown from a local anvil replay with the clock moved forward.
- **The verifier trusts the addresses in case.json.** It reads events from the registry and notice contract that case.json names; the issuer and contract addresses need to be pinned through a separate channel (for example, stated in the filing). The CLI can pin them with `--expect-handler` and compares them with `deployments/<chainId>.json`; the browser verifier does neither.
- **Condition-to-evidence links are the handler's declaration.** The chain records what the handler linked and when; it does not prove that the underlying facts are true.
- **Live verification relies on logs reported by public RPCs.** The verifier reads two RPCs and requires them to agree; if only one answers, it says "Live (1 RPC)". The offline path compares against the bundled event log instead and is not independent.
- **Keeping the original documents is the filer's job.** The chain stores hashes and a URL; if the URL goes down, only the hash remains.
- **Writes are EVM only.** Notices are minted on Sepolia or a local anvil chain to stand-in wallets. TRON wallets are read, not written to. The write module refuses any chainId other than 31337 and 11155111.
- **Activity table coverage.** Fetched once on 2026-10-25 from public explorers (Blockscout, TronGrid) and cached. Older pages were not fetched, so months before 2024-04 (Ethereum) and 2023-10 (TRON) may be undercounted (per-wallet `completeFrom` in case.json). The exchange wallet named in the complaint was not fetched.
- **Conditions were pre-extracted** from the order and confirmed by hand; there is no live extraction in this build.
- **Other default requirements are not covered** (e.g., an SCRA affidavit).
- **Duplicate service per recipient is rejected; registry and notice contract are linked by the scripts, not on-chain.** The notice contract refuses a second notice for the same case, condition and recipient. The registry does not call the notice contract; the scripts record each notice transaction as condition evidence.
- **Replay dates.** The original service deadline was 2025-10-09. The replay uses case opening + 120 days, because the registry accepts only a future deadline.

## Why blockchain

Two layers, and they carry different weight.

1. **Service has to happen on-chain because the defendant only exists on-chain.** The only known contact point is a wallet address, and some courts have ordered service by token or NFT airdrop (L1, L6). ServeChain's notice fixes the SHA-256 of the papers in the token itself, so the token shows *what* was served, not only that something was sent.
2. **Anchoring the compliance record is added value, not a legal requirement.** A screenshot or a spreadsheet can be edited later. Recording each condition's evidence hash, the declared affidavit time and the compliance summary hash on-chain means the filer cannot quietly change their own record afterward, and the other side can check that without trusting us or our server. What on-chain gives: public reading, ordering, and a non-transferable service NFT. What it does not give: the truth of the facts behind each record; and if only a proof of time were needed, an RFC 3161 timestamp would also do.

## Contracts (Sepolia, chainId 11155111)

| Contract | Address | Deploy tx |
|---|---|---|
| `ServiceNotice721` (soulbound notice, hash-locked `tokenURI`) | [`0xA7bA126d3cE7E90155CB11b3EF20d426B8a84001`](https://sepolia.etherscan.io/address/0xA7bA126d3cE7E90155CB11b3EF20d426B8a84001) | [`0x1e3927a7…0b69`](https://sepolia.etherscan.io/tx/0x1e3927a7ba1853f2f5e61a7aee1179a649e4c2eedd6f8bc730971dbbd3790b69) |
| `CaseFileRegistry` (conditions, fulfillments, deadline, snapshot) | [`0xB2a07aEF698cC158180635dD252E5477049C1ac2`](https://sepolia.etherscan.io/address/0xB2a07aEF698cC158180635dD252E5477049C1ac2) | [`0x6d03cfe4…78ca`](https://sepolia.etherscan.io/tx/0x6d03cfe4873926ad1bf2c0c25c9cbcfa1083ebc5d0f9d79c91fa38ec7bd278ca) |

Deployment block 11989763 ([`deployments/11155111.json`](deployments/11155111.json)), issuer `0x4228b6c33cDd2f9DeE2dBB4B55BDFf02c176F580`. Case ID `0xa1ad380631e7bea03b9a32c282e441bcfd31109f1c2c93c6f7d2402f3d39b9b7` = `keccak256(abi.encode(handler, caseRef))`, with `caseRef = keccak256("NY-SUP-QUEENS-700647-2025-demo")`; the registry derives it from the caller, so another address cannot open the same case id (the verifier re-checks this from the `CaseRefBound` event). Service recorded complete: [`0x03b2f014…2138`](https://sepolia.etherscan.io/tx/0x03b2f014c6e7e2ca2fa8e4b259c0be9f62eff991c7fb1532fa4d3245ef8c2138). Compliance summary anchor tx: [`0xd6209e97…7761`](https://sepolia.etherscan.io/tx/0xd6209e973abdfae95561e075d3c0fdeba05ad7e19abeb47d92f8d8eafaa27761). Full transaction list: [`web/public/case/case.json`](web/public/case/case.json).

Earlier Sepolia deployments (0x5D39…/0xD712… and 0x7878…/0xB7a0…) are superseded.

## Reproduce

Requires Foundry (forge, anvil), Node.js 22+, and Chrome or Brave for PDF rendering (or set `CHROME_PATH`).

```sh
forge install foundry-rs/forge-std@v1.10.0 --no-git
forge install OpenZeppelin/openzeppelin-contracts@v5.4.0 --no-git
npm ci
forge test
npm test
npm run demo:local
npm run verify -- web/public/case/exhibit.pdf
```

- `forge test` runs the 50 contract tests. `npm test` runs the 36 script tests (chainId guard, hashing, verifier).
- `npm run demo:local` starts anvil, deploys both contracts, serves stand-in wallets, records the affidavit, advances the local clock past the deadline, anchors the snapshot and writes `web/public/case-local/`.
- `npm run demo:sepolia` repeats the flow on Sepolia and needs `DEPLOYER_KEY` and `SEPOLIA_RPC_URL` in `.env`. Run it after `demo:local`: the Sepolia case links the local snapshot. Both runs write the same service bundle (`docs/service-bundle.pdf`, built without timestamps), so its hash is identical in both cases.
- Web app: `cd web && npm i && npm run dev`.
- `npm run deployments:fix -- <chainId>` rewrites the deployment block in `deployments/<chainId>.json` from forge broadcast receipts; only needed after deploying with `forge script contracts/script/Deploy.s.sol`.
- `cd web && node scripts/deck-pdf.mjs` prints `docs/deck.pdf`; PDFs made by the scripts carry `ServeChain` as Creator and Producer.

### Verify

`npm run verify -- <exhibit.pdf>` (the compliance summary file) checks the PDF hash, issuer, case id, order and conditions hashes, notices, the service condition mask, each condition's evidence link (the `txRef` and recomputed preimage), the service deadline, the filing date against the last service evidence, and the declared affidavit against Sepolia events.

| Option | Effect |
|---|---|
| `--case <case.json>` | Case file to check against (default `web/public/case/case.json`; use `web/public/case-local/case.json` for the local run). |
| `--rpc <url>` | RPC to read; repeat for more. Tried before `SEPOLIA_RPC_URL` and the public defaults. |
| `--offline` | Compare against the bundled `events.json` instead of the chain. |
| `--expect-handler 0x…` | Issuer you confirmed through another channel; any other issuer is MISMATCH. |
| `--deployments <dir>` | Folder with `<chainId>.json` to compare addresses and issuer (default `deployments/`). |

| Exit code | Meaning |
|---|---|
| 0 | MATCH, read live. The label says "Live (2 RPCs agree)" or "Live (1 RPC)". |
| 1 | MISMATCH (a changed byte, a different issuer, RPCs that disagree, or any failed check). |
| 2 | Usage or input error. |
| 3 | MATCH offline, against the bundled event log only, not independent. |

Every run ends with the line "Trusts: the contract addresses and issuer published in case.json; confirm the issuer through an independent channel". The browser verifier also reads two RPCs and shows "Live (2 RPCs agree)", or a blue "MATCH (offline)" when no RPC answers. It does not compare against a `deployments/` file and has no `--expect-handler`, so it relies on the addresses in case.json alone.

## Data sources and ethics

- **Public court records.** The case, order text and wallet addresses come from documents the New York Attorney General published at ag.ny.gov. Court PDFs are not redistributed here; the app links to the original and shows its SHA-256 so you can compare (decision and pleadings: `c75a4443ca79356650c69eb345c6962cbce2055517026697beefaa7169db393b`; complaint: `0de3b6c3e1b099be7a10bc2aa657e9f28fd25c4d4f4d0a03612b6b05b1913b30`).
- **Real wallets are read only.** Nothing is ever sent to the defendant wallets. Writes are limited by code to anvil (31337) and Sepolia (11155111), and notices go to stand-in addresses that are labelled as such.
- **Synthetic data is marked.** Contact details in the impracticability step (each row marked "synthetic"), the service document bundle ("SAMPLE — not a real court filing") and the sample affidavit data (to be sworn by the person who served) are synthetic and labelled on screen. Counts and dates follow the decision.
- **No tracking.** ServeChain adds no click tracking or open logging to the notice link or the posted papers.
- **No victim names or contact details are used.** Public on-chain counterparty addresses appear in the activity cache.

## License

MIT. See [LICENSE](LICENSE).
