# ServeChain

**Problem.** Courts already let plaintiffs serve anonymous crypto defendants by airdropping an NFT to their wallet, but proving that every condition of that order was met is still done by hand with explorer and NFT-platform webpages.
**What I built.** ServeChain serves the papers as a hash-locked, non-transferable notice NFT, then turns the court order into a checklist, links each on-chain transaction to the condition it satisfies, computes the response deadline, and produces one exhibit PDF.
**What it shows.** Replaying a real 2025 New York order on Sepolia, all five order conditions link to on-chain evidence, and anyone can re-check the exhibit against the chain from a browser or CLI, with no server of ours involved.

- **Live demo:** https://kimsabin725.github.io/servechain/
- **Demo video (3 min):** https://youtu.be/58pzpLuhmQc

> Not legal advice. A replay of public court records for demonstration. Nothing was ever sent to the real defendant wallets; they are read only.

## Why I built this

I'm going through a lawsuit myself, and the parts that felt most fragile were the procedural ones: serving papers, tracking what the court ordered, and keeping track of deadlines. When I read how New York courts handle defendants who are known only by a wallet address, I saw the same gap: the service method is modern, but the bookkeeping around it is still manual.

## How it works

The walkthrough at the live demo has the same five steps.

| Step | Screen | What happens |
|---|---|---|
| 1 | **Impracticability** | Real defendant wallet activity (read only) next to the contact attempts the court relied on. This is the showing that made NFT service necessary. |
| 2 | **Conditions** | The order's obligations become a checklist, each with its exact wording and page. The checklist hash is fixed on-chain when the case is opened. |
| 3 | **Serve** | The service papers are hashed. One soulbound notice NFT per target wallet is minted with that hash and the papers' URL fixed in its `tokenURI`. Each transaction is linked to the condition it satisfies, and open conditions stay red. Service that someone else already made (for example, the real July 2025 notices in this case) can be imported read only. |
| 4 | **Deadline** | The filer declares when the affidavit of service was filed (`declaredFiledAt`). The registry derives the response deadline (+30 days, CPLR 320(a)) on-chain. After the deadline, a Merkle root of the wallet activity table can be anchored. |
| 5 | **Exhibit & verify** | One PDF (A: impracticability table, B: condition-by-condition record, C: deadlines and post-service activity). Its SHA-256 is anchored in the registry. Drop the PDF into the browser verifier, or run the CLI, to get MATCH or MISMATCH. |

## Legal basis

Status: **excerpt verified** = every quoted string was returned verbatim from the official nysenate.gov page for that section; only the excerpt is checked, not the full section. **summary** = a paraphrase; any part not covered by a quote is not checked against the statute. For court documents, **read** = the document was opened and quoted, and **as cited** = the citation is copied as printed in the L1 decision and the cited decision itself was not read. Statute excerpts were retrieved from nysenate.gov on 2026-10-25 as short quotes, not full section text. Decision pages 1 to 8 are scanned; quotes from them come from an OCR text layer corrected only for obvious character errors.

| # | Point | Source | Status |
|---|---|---|---|
| L1 | *People v Unknown Parties in Ownership and/or Control of Digital Wallet Addresses*, Sup. Ct. N.Y., Queens County, Index No. 700647/2025, Hon. Karen Lin. Order signed 2025-06-09, entered 2025-06-11 (NYSCEF 21). Cited by Index No. only; a Slip Op number was not confirmed. Grants service under CPLR 308(5). | [Decision and pleadings PDF](https://ag.ny.gov/sites/default/files/court-filings/people-v-digital-wallet-0xd7648fffa48e06b0107435a966f3f1e9dbe10b7d-decision-and-pleadings-2025.pdf), pp. 1, 6, 9 | read |
| L2 | Order conditions: 120 days from entry to serve (306-b extension); serve the full document set with the decision and notice of entry; by airdropping NFTs hyperlinked to a website with the papers; to Wallets 1, 2 and 3; file an affidavit of service under CPLR 306(a), and "service shall be deemed complete upon such filing". | Same PDF, p. 6 | read (OCR) |
| L3 | Impracticability showing: calls and texts to 14 numbers (Dec 6 and 9-11, 2024), 4 email addresses with 1 "delivered", wallets used April to December 2024, about $2,179,507 frozen. | Same PDF, pp. 2, 4-5 | read (OCR) |
| L4 | How service was shown at the motion stage (January 2025): a law-student intern minted the Ethereum notice through an NFT platform's shared contract and TRON notices through separate contracts, and showed delivery with explorer and NFT-platform webpages (Etherscan, Tronscan). | Same PDF, pp. 5, 69-72 | read |
| L5 | Defendant wallets: `0xD7648FffA48e06b0107435a966F3F1e9DBe10B7d` (Ethereum), `TCfr5oZp8qJJwarum6kjt4o23wTNhi1ss8` and `TDvRhqyGMW5NuZjhiAmEmYuXrSZ4bdZtmu` (TRON). | [Complaint PDF](https://ag.ny.gov/sites/default/files/court-filings/people-v-digital-wallet-0xd7648fffa48e06b0107435a966f3f1e9dbe10b7d-complaint-2025.pdf), p. 1 | read |
| L6 | Earlier NFT service orders: *LCX AG v 1.274M U.S. Dollar Coin*, 2022 NY Slip Op 32834[U] (Sup Ct, NY County); *Meghji v Wallet Owner (In re Celsius Network LLC)*, 666 BR 28 [Bankr SD NY 2024]. List in [`data/precedents.json`](data/precedents.json). | Cited in the L1 decision, p. 4 | as cited |
| L7 | CPLR 306(a): proof of service must specify the papers served, the person served, and the date, time and place. | [nysenate.gov/legislation/laws/CVP/306](https://www.nysenate.gov/legislation/laws/CVP/306) | excerpt verified |
| L8 | CPLR 306-b: service within 120 days after commencement; the court may extend on good cause or in the interest of justice. | [nysenate.gov/legislation/laws/CVP/306-B](https://www.nysenate.gov/legislation/laws/CVP/306-B) | excerpt verified |
| L9 | CPLR 308(5): service "in such manner as the court ... directs" when 308(1), (2) and (4) are impracticable. It has no completion rule of its own, so completion comes from the order (L2). | [nysenate.gov/legislation/laws/CVP/308](https://www.nysenate.gov/legislation/laws/CVP/308) | excerpt verified |
| L10 | CPLR 320(a): when served under 308(2) to (5), "the appearance shall be made within thirty days after service is complete". Used as: response deadline = affidavit filing + 30 days. | [nysenate.gov/legislation/laws/CVP/320](https://www.nysenate.gov/legislation/laws/CVP/320) | excerpt verified |
| L10a | CPLR 3012(c): when the summons and complaint are served under 308(2) to (5), "service of an answer shall be made within thirty days after service is complete." Same 30-day count for the answer. | [nysenate.gov/legislation/laws/CVP/3012](https://www.nysenate.gov/legislation/laws/CVP/3012) | excerpt verified |
| L11 | CPLR 3215(f): a default application must include proof of service of the summons and complaint, and proof of the facts, the default and the amount due. | [nysenate.gov/legislation/laws/CVP/3215](https://www.nysenate.gov/legislation/laws/CVP/3215) | excerpt verified |
| L12 | CPLR 3215(c): if the plaintiff does not seek a default judgment within one year after the default, the complaint is dismissed as abandoned, "unless sufficient cause is shown why"; the words after "why" were not retrieved. | Same page | excerpt verified (rest of the exception: summary) |
| L13 | NFTs titled "Service of NY OAG Summons and Complaint No 700647-2025" reached all three real wallets on 2025-07-30, inside the 120-day window (due 2025-10-09). The Ethereum token contract returns `name()` = `SoulBoundTest`. | On-chain, e.g. [Etherscan tx](https://etherscan.io/tx/0xc1663d2f20123334529ae08babaf9c64b08b5c003e07f2437891a4f90b15aba2) | read on-chain; sender not matched to court records |

## What ServeChain does NOT claim

- **It does not prove that a defendant actually received or read the papers.** It shows which papers were sent, to which address, and when.
- **Wallet activity is not evidence of knowledge.** Activity after service is shown as context only.
- **It does not decide whether default-judgment requirements are met.** That is for counsel and the court.
- **It is not legal advice.** Deadlines and rule readings need a lawyer's review before use in a filing.

## Limitations

- **`declaredFiledAt` cannot be proven by the chain.** The filer enters the affidavit filing time. The chain records the declared value and the affidavit hash, not the court's acceptance.
- **No weekend or holiday roll-forward.** Deadlines are plain day counts. General Construction Law §25-a was not read and is not applied.
- **The Sepolia activity snapshot is pending.** The registry refuses a snapshot before the response deadline (2026-11-24 07:44 UTC), and testnet time cannot be advanced. The snapshot step is shown from a local anvil replay with the clock moved forward.
- **Writes are EVM only.** Notices are minted on Sepolia or a local anvil chain to stand-in wallets. TRON wallets are read, not written to. The write module refuses any chainId other than 31337 and 11155111.
- **Activity table coverage.** Fetched once on 2026-10-25 from public explorers (Blockscout, TronGrid) and cached. Older pages were not fetched, so months before 2024-04 (Ethereum) and 2023-10 (TRON) may be undercounted (per-wallet `completeFrom` in case.json). The exchange wallet named in the complaint was not fetched.
- **Conditions were pre-extracted** from the order and confirmed by hand; there is no live extraction in this build.
- **Duplicate service per recipient is rejected; registry and notice contract are linked by the scripts, not on-chain.** The notice contract refuses a second notice for the same case, condition and recipient. The registry does not call the notice contract; the scripts record each notice transaction as condition evidence.
- **Replay dates.** The original service deadline was 2025-10-09. The replay uses case opening + 120 days, because the registry accepts only a future deadline.

## Why blockchain

Two layers, and they carry different weight.

1. **Service has to happen on-chain because the defendant only exists on-chain.** The only known contact point is a wallet address, and courts have already directed service by NFT airdrop (L1, L6). ServeChain's notice fixes the SHA-256 of the papers in the token itself, so the token shows *what* was served, not only that something was sent.
2. **Anchoring the compliance record is added value, not a legal requirement.** A screenshot or a spreadsheet can be edited later. Recording each condition's evidence hash, the declared affidavit time and the exhibit hash on-chain means the filer cannot quietly change their own record afterward, and the other side can check that without trusting us or our server.

## Contracts (Sepolia, chainId 11155111)

| Contract | Address | Deploy tx |
|---|---|---|
| `ServiceNotice721` (soulbound notice, hash-locked `tokenURI`) | [`0xB7a040C0D6860aABc93E20bc911270622D33De75`](https://sepolia.etherscan.io/address/0xB7a040C0D6860aABc93E20bc911270622D33De75) | [`0x2a2677d7…5477`](https://sepolia.etherscan.io/tx/0x2a2677d76f2faeab5cc5269d58bec7311a3871e5e4e14e4bffd0804ecca45477) |
| `CaseFileRegistry` (conditions, fulfillments, deadline, snapshot) | [`0x787867F00a45962666b39cD3523954aE62DE2664`](https://sepolia.etherscan.io/address/0x787867F00a45962666b39cD3523954aE62DE2664) | [`0x18311cb0…da7c`](https://sepolia.etherscan.io/tx/0x18311cb0becb13cc544265b69278211e158ff9c323cda1fcd08803e76808da7c) |

Deployment block 11989459 ([`deployments/11155111.json`](deployments/11155111.json)). Case ID `0xa1ad380631e7bea03b9a32c282e441bcfd31109f1c2c93c6f7d2402f3d39b9b7` = `keccak256(abi.encode(handler, caseRef))`, with `caseRef = keccak256("NY-SUP-QUEENS-700647-2025-demo")`; the registry derives it from the caller, so another address cannot open the same case id (the verifier re-checks this from the `CaseRefBound` event). Exhibit anchor tx: [`0xbb030a7a…cef3`](https://sepolia.etherscan.io/tx/0xbb030a7a67d5ad6d13e5cf3f479b4af10c64ab042922ecbf319b7cf27721cef3). Full transaction list: [`web/public/case/case.json`](web/public/case/case.json).

## Reproduce

Requires Foundry (forge, anvil), Node.js 22+, and Chrome or Brave for PDF rendering (or set `CHROME_PATH`).

```sh
forge install foundry-rs/forge-std@v1.10.0 --no-git
forge install OpenZeppelin/openzeppelin-contracts@v5.4.0 --no-git
npm i
forge test
npm test
npm run demo:local
npm run verify -- web/public/case/exhibit.pdf
```

- `forge test` runs the contract tests (42 at the time of writing). `npm test` runs the 20 script tests (chainId guard, hashing, verifier).
- `npm run demo:local` starts anvil, deploys both contracts, serves stand-in wallets, records the affidavit, advances the local clock past the deadline, anchors the snapshot and writes `web/public/case-local/`.
- `npm run verify -- <exhibit.pdf>` checks the PDF hash, order hash, conditions hash, notices, condition statuses and the declared affidavit against Sepolia events (falls back to the bundled `events.json` if the RPC fails; add `--offline` to force that). Use `--case web/public/case-local/case.json` for the local run.
- Web app: `cd web && npm i && npm run dev`.
- `npm run demo:sepolia` repeats the flow on Sepolia and needs `DEPLOYER_KEY` and `SEPOLIA_RPC_URL` in `.env`.

## Data sources and ethics

- **Public court records.** The case, order text and wallet addresses come from documents the New York Attorney General published at ag.ny.gov. Court PDFs are not redistributed here; the app links to the original and shows its SHA-256 so you can compare (decision and pleadings: `c75a4443ca79356650c69eb345c6962cbce2055517026697beefaa7169db393b`; complaint: `0de3b6c3e1b099be7a10bc2aa657e9f28fd25c4d4f4d0a03612b6b05b1913b30`).
- **Real wallets are read only.** Nothing is ever sent to the defendant wallets. Writes are limited by code to anvil (31337) and Sepolia (11155111), and notices go to stand-in addresses that are labelled as such.
- **Synthetic data is marked.** Contact details in the impracticability step, the service document bundle ("SAMPLE — not a real court filing") and the affidavit are synthetic and labelled on screen. Counts and dates follow the decision.
- **No tracking.** ServeChain adds no click tracking or open logging to the notice link or the posted papers.
- **No victim information** from the case is used.

## License

MIT. See [LICENSE](LICENSE).
