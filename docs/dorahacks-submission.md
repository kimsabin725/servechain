# DoraHacks BUIDL submission: ServeChain

## Name

ServeChain

## Track

- Primary: LegalTech & RegTech (to confirm on the DoraHacks page)

## One-line intro

ServeChain serves court papers to wallet-only defendants as a hash-locked NFT, then builds a case file that links each condition of the court's order to on-chain evidence, which anyone can verify against the chain.

## Short description (for the card)

Blockchain service of process is already court-approved. Proving you complied with the order is still manual. ServeChain does both: serve, then build the verifiable case file.

## Long description

### The problem

When a defendant is known only by a crypto wallet address, courts have allowed service of process by NFT airdrop (for example LCX AG v 1.274M U.S. Dollar Coin, 2022 NY Slip Op 32834[U]). In a 2025 New York case (Sup. Ct. Queens County, Index No. 700647/2025), the court ordered the plaintiff to serve the full set of papers within 120 days, by NFTs hyperlinked to a website with the papers, to three named wallets, and then to file an affidavit of service, with service complete on filing.

The service method is new. The proof around it is not. At the motion stage of that case, delivery was shown with explorer and NFT-platform webpages (Etherscan, Tronscan) attached to an affirmation. Nothing ties each page to the order condition it satisfies, flags what is still missing, records which exact papers were served, or computes the response deadline.

### What ServeChain does

A five-step walkthrough that replays the real order on Sepolia:

1. **Impracticability**: real defendant wallet activity (read only) beside the contact attempts the court relied on.
2. **Conditions**: the order becomes a checklist with exact quotes and page numbers; its hash is fixed on-chain when the case is opened.
3. **Serve**: the papers are hashed; one soulbound notice NFT per wallet is minted with that hash and the papers' URL fixed in `tokenURI`; each transaction is linked to the condition it satisfies. Service someone else already made (the real July 2025 notices) can be imported read only.
4. **Deadline**: the filer declares the affidavit filing time; the registry derives the response deadline (+30 days, CPLR 320(a); CPLR 3012(c) for the answer) on-chain.
5. **Exhibit & verify**: one PDF exhibit (impracticability, condition-by-condition record, deadlines and activity), its SHA-256 anchored on-chain, checked by a browser or CLI verifier with no server of ours involved.

### What it shows

On Sepolia, all five conditions of the order link to on-chain evidence, and the published exhibit verifies as MATCH while a copy with one byte changed returns MISMATCH. The served bundle and the affidavit also return MATCH, and with the RPC blocked the verifier returns MATCH (offline) from the bundled event log. The case id is `keccak256(abi.encode(handler, caseRef))`, and the verifier re-derives it from the `CaseRefBound` event.

### Why blockchain

1. Service has to happen on-chain because the defendant only exists on-chain. The notice locks the hash of the papers, so it shows what was served.
2. Anchoring the compliance record is added value, not a legal requirement: the filer cannot quietly change their own record, and the other side can check it without trusting us.

### What it does not claim

It does not prove that a defendant received or read the papers. Wallet activity is not evidence of knowledge. It does not decide whether default-judgment requirements are met. It is not legal advice.

### Limitations

The affidavit filing time is declared by the filer and cannot be proven by the chain. Weekend and holiday roll-forward is not applied. The Sepolia activity snapshot is pending until the response deadline passes (2026-11-24); the snapshot step is shown from a local anvil replay. Writes are EVM only; TRON wallets are read, not served. Duplicate service per recipient is rejected; registry and notice contract are linked by the scripts, not on-chain.

### Built with

Solidity 0.8.28 and Foundry (OpenZeppelin ERC-721), Node.js and viem, React and Vite (static site, no backend), headless Chromium for the exhibit PDF. Two contracts: `ServiceNotice721` and `CaseFileRegistry`.

### Data and ethics

Case documents are public records published by the New York Attorney General; court PDFs are linked, not redistributed. Real defendant wallets are read only; writes are restricted in code to anvil and Sepolia and go to labelled stand-in wallets. Synthetic contact details, service papers and affidavit are labelled on screen.

## Links

| Item | Link |
|---|---|
| Live demo | https://kimsabin725.github.io/servechain/ |
| Demo video | YOUTUBE_LINK_TBD |
| GitHub repository | https://github.com/kimsabin725/servechain |
| Pitch deck (PDF) | DECK_PDF_LINK_TBD (docs/deck.pdf in the repository) |
| ServiceNotice721 (Sepolia) | https://sepolia.etherscan.io/address/0xB7a040C0D6860aABc93E20bc911270622D33De75 |
| CaseFileRegistry (Sepolia) | https://sepolia.etherscan.io/address/0x787867F00a45962666b39cD3523954aE62DE2664 |
| Exhibit anchor tx | https://sepolia.etherscan.io/tx/0xbb030a7a67d5ad6d13e5cf3f479b4af10c64ab042922ecbf319b7cf27721cef3 |
| Source court order (public) | https://ag.ny.gov/sites/default/files/court-filings/people-v-digital-wallet-0xd7648fffa48e06b0107435a966f3f1e9dbe10b7d-decision-and-pleadings-2025.pdf |

## Team

Sabin Kim, solo builder. Strategic planning in financial services.
