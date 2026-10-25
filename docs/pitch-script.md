# ServeChain: 3-minute video script

Timing is calculated at 150 words per minute (2.5 words per second) from the word count of each spoken block. Screen directions are in brackets. Record at 1280x800 or larger, light theme, from the live demo (https://kimsabin725.github.io/servechain/). Keep the browser zoom at 100% so the step bar stays visible.

Before recording: open the order PDF (ag.ny.gov link from Step 0) at page 6 in a second tab, and have Sepolia Etherscan open for the registry address.

---

## Part 1. The whole story in about 60 seconds

### Scene 1 (0:00 to 0:25) Problem

[Screen: the order PDF, page 6, zoomed on the "ORDERED" paragraphs. Highlight "airdropping NFTs", "within 120 days", "file an affidavit of service".]

> This is a public court order from New York, 2025, in a case brought by the Attorney General. I am not a party to it. The defendants were known only by three crypto wallet addresses, so the court ordered service by airdropping an NFT. It comes with conditions: a deadline, a set of documents, three wallets, and a filed affidavit.

(60 words, about 24 s)

### Scene 2 (0:25 to 0:46) What ServeChain does

[Screen: live demo, Step 0 "Overview", showing the banner "For counsel's review. Does not determine compliance. Not legal advice." Then click "3 Serve" in the step bar and scroll to "3 · Conditions after service".]

> Some courts have ordered service by NFT. Proving you complied with the order is still manual. ServeChain does both. It mints the notice with a hash of the papers locked inside, then links each transaction to a condition. Before step four, four conditions have evidence linked. The affidavit has none yet.

(51 words, about 20 s)

### Scene 3 (0:46 to 1:06) Result

[Screen: back to Step 0, click "Verify now": the page jumps to "5 Summary & verify" and shows MATCH. Click "Try a tampered copy": MISMATCH.]

> The result is one compliance summary, an attachment for counsel. Its hash is on Sepolia. Anyone with the file can check it from a browser. The published file matches. Change one byte, and it fails. No server of ours is needed to read the chain.

(45 words, about 18 s)

---

## Part 2. How it works

### Scene 4 (1:06 to 1:28) Impracticability

[Screen: click "1 Impracticability". Point at the three wallet cards, then the shaded April to December 2024 band, then "Contact attempts".]

> Step one is the impracticability showing: the three real defendant wallets, read only. Balances still match the 2024 freeze; two still signed transactions this year, beside transfers from others. The shaded band is the period the court relied on. Next to it, the contact attempts: fourteen phone numbers and four emails; one email was delivered, none gave a mailing address.

(56 words, about 22 s)

### Scene 5 (1:28 to 1:43) Conditions

[Screen: click "2 Conditions". Scroll slowly through the five condition cards with their quotes and page numbers.]

> Step two turns the order into a checklist. Each item keeps the exact words and the page. The checklist's hash is written on-chain when the case is opened, so any later edit is detectable.

(34 words, about 14 s)

### Scene 6 (1:43 to 2:07) Serve

[Screen: click "3 Serve". Point at the TRON note at the top, show "1 · Service bundle" hash, then "2 · Notices minted" table, then click one TX link to open Sepolia Etherscan. Come back and point at the "replay" badges, then the "Context only" card.]

> Step three serves. The papers are hashed, and one non-transferable notice goes to each Sepolia stand-in wallet: the order names two TRON wallets, and this tool writes only to EVM chains. Nothing is ever sent to the real wallets. NFTs already seen there are context only, not evidence.

(48 words, about 19 s)

### Scene 7 (2:07 to 2:29) Deadline

[Screen: click "4 Deadline". Point at "Declared by filer", then "2026-11-24" (New York calendar date), the on-chain timestamp line, then the yellow notes.]

> Step four starts the clock. Service is complete when the affidavit is filed, and the filer declares that time. Filing can be recorded only once every service condition has evidence; the contract then adds thirty days under CPLR 320(a) and 3012(c). The date is an estimate, and it only matters if service was valid.

(54 words, about 22 s)

---

## Part 3. Why, limits, close

### Scene 8 (2:29 to 2:45) Why blockchain

[Screen: deck slide 5 "Why blockchain", or the README section.]

> Why a blockchain? First, the defendant only exists on-chain, so service has to happen there. Second, anchoring the record is extra: the filer cannot quietly change it, and the other side can check it against the chain.

(37 words, about 15 s)

### Scene 9 (2:45 to 3:00) Limits and close

[Screen: deck slide 6, then back to Step 0 of the live demo with the URL visible.]

> It does not prove anyone read the papers, it does not determine compliance, and it is not legal advice. It organizes the proof a lawyer already has to give. ServeChain: serve, then build the case file.

(36 words, about 14 s)

---

Total spoken: 421 words, about 2:48 at 150 wpm. The remaining time covers clicks and page loads; scene start times above include those pauses.

## Recording notes

- Say "testnet stand-ins" on screen 6 every take. It is the one sentence a reviewer must not miss.
- Step 5 should read "Live (2 RPCs agree)". If the live RPCs are slow, the verifier falls back to the bundled events file and shows "MATCH (offline)". That is still a valid take; do not cut it. The result also shows that the case id is derived from the handler address and the case reference.
- Do not show the Sepolia snapshot as done. Say it is shown via local replay; on Sepolia it is pending until the snapshot gate opens at 2026-11-24 08:46 UTC.
