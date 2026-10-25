# ServeChain: 3-minute video script

Timing is calculated at 150 words per minute (2.5 words per second) from the word count of each spoken block. Screen directions are in brackets. Record at 1280x800 or larger, light theme, from the live demo (https://kimsabin725.github.io/servechain/). Keep the browser zoom at 100% so the step bar stays visible.

Before recording: open the order PDF (ag.ny.gov link from Step 0) at page 6 in a second tab, and have Sepolia Etherscan open for the registry address.

---

## Part 1. The whole story in 60 seconds

### Scene 1 (0:00 to 0:20) Problem

[Screen: the order PDF, page 6, zoomed on the "ORDERED" paragraphs. Highlight "airdropping NFTs", "within 120 days", "file an affidavit of service".]

> This is a real court order from New York, 2025. The defendants were known only by three crypto wallet addresses, so the court ordered the plaintiff to serve them by airdropping an NFT. It comes with conditions: a deadline, a set of documents, three wallets, and a filed affidavit.

(49 words, about 20 s)

### Scene 2 (0:20 to 0:42) What ServeChain does

[Screen: live demo, Step 0 "Overview". Then click "3 Serve" in the step bar and scroll to "3 · Conditions after service".]

> Serving by NFT is already allowed. Proving you followed the order is still screenshots. ServeChain does both. It mints the notice with a hash of the papers locked inside, then links every transaction to the condition it satisfies. Four conditions are green. The affidavit is still red.

(47 words, about 19 s)

### Scene 3 (0:42 to 1:00) Result

[Screen: click "5 Exhibit & verify". Click "Verify the published exhibit": MATCH. Click "Try a tampered copy": MISMATCH.]

> The result is one exhibit for the affidavit or a default motion. Its hash is on Sepolia. Anyone can check it from a browser. The real file matches. Change one byte, and it fails. No server of ours is involved.

(40 words, about 16 s)

---

## Part 2. How it works

### Scene 4 (1:00 to 1:22) Impracticability

[Screen: click "1 Impracticability". Point at the three wallet cards, then the shaded April to December 2024 band, then "Contact attempts".]

> Step one is why NFT service was needed. These are the three real defendant wallets, read only, with transactions as recent as this month. The shaded band is the period the court relied on. Next to it are the contact attempts from the decision: fourteen phone numbers, four emails, no usable address.

(52 words, about 21 s)

### Scene 5 (1:22 to 1:40) Conditions

[Screen: click "2 Conditions". Scroll slowly through the five condition cards with their quotes and page numbers.]

> Step two turns the order into a checklist. Each item keeps the exact words and the page. The checklist's hash is written on-chain when the case is opened, so it cannot be edited later.

(34 words, about 14 s)

### Scene 6 (1:40 to 2:05) Serve

[Screen: click "3 Serve". Show "1 · Service bundle" hash, then "2 · Notices minted" table, then click one TX link to open Sepolia Etherscan. Come back and expand "Imported: NY OAG service, Jul 30 2025".]

> Step three serves. The papers are hashed, and one non-transferable notice goes to each wallet. In this demo, those are testnet stand-ins. Nothing is ever sent to the real wallets. Below, the real notices from July 2025 are imported read only, as evidence for the same conditions.

(47 words, about 19 s)

### Scene 7 (2:05 to 2:28) Deadline

[Screen: click "4 Deadline". Point at "Declared by filer", then "2026-11-24", then the yellow notes.]

> Step four starts the clock. The order says service is complete when the affidavit is filed. The filer declares that time, and the contract adds thirty days under CPLR 320(a). The chain cannot prove the filing date, and weekend rules are not applied. The screen says so.

(47 words, about 19 s)

---

## Part 3. Why, limits, close

### Scene 8 (2:28 to 2:46) Why blockchain

[Screen: deck slide 5 "Why blockchain", or the README section.]

> Why a blockchain? First, the defendant only exists on-chain, so service has to happen there. Second, anchoring the record is extra: the filer cannot quietly change it, and the other side can check without trusting us.

(36 words, about 14 s)

### Scene 9 (2:46 to 3:00) Limits and close

[Screen: deck slide 6, then back to Step 0 of the live demo with the URL visible.]

> It does not prove anyone read the papers, and it is not legal advice. It organizes the proof a lawyer already has to give. ServeChain: serve, then build the case file.

(31 words, about 12 s)

---

Total spoken: 383 words, about 2:33 at 150 wpm. The remaining time covers clicks and page loads; scene start times above include those pauses.

## Recording notes

- Say "testnet stand-ins" on screen 6 every take. It is the one sentence a reviewer must not miss.
- If the live RPC is slow in Step 5, the verifier falls back to the bundled events file and shows "Offline". That is still a valid take; do not cut it.
- Do not show the Sepolia snapshot as done. It is pending until 2026-11-24; the screen shows the local replay with the clock moved forward.
- Upload as an unlisted YouTube video and paste the link into README.md, docs/dorahacks-submission.md and the deck (slide 8). Check playback in a logged-out browser before submitting.
