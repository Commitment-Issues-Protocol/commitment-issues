<div align="center">

<pre>
 ██████╗ ██████╗ ███╗   ███╗███╗   ███╗██╗████████╗███╗   ███╗███████╗███╗   ██╗████████╗
██╔════╝██╔═══██╗████╗ ████║████╗ ████║██║╚══██╔══╝████╗ ████║██╔════╝████╗  ██║╚══██╔══╝
██║     ██║   ██║██╔████╔██║██╔████╔██║██║   ██║   ██╔████╔██║█████╗  ██╔██╗ ██║   ██║   
██║     ██║   ██║██║╚██╔╝██║██║╚██╔╝██║██║   ██║   ██║╚██╔╝██║██╔══╝  ██║╚██╗██║   ██║   
╚██████╗╚██████╔╝██║ ╚═╝ ██║██║ ╚═╝ ██║██║   ██║   ██║ ╚═╝ ██║███████╗██║ ╚████║   ██║   
 ╚═════╝ ╚═════╝ ╚═╝     ╚═╝╚═╝     ╚═╝╚═╝   ╚═╝   ╚═╝     ╚═╝╚══════╝╚═╝  ╚═══╝   ╚═╝   
                      ██╗███████╗███████╗██╗   ██╗███████╗███████╗
                      ██║██╔════╝██╔════╝██║   ██║██╔════╝██╔════╝
                      ██║███████╗███████╗██║   ██║█████╗  ███████╗
                      ██║╚════██║╚════██║██║   ██║██╔══╝  ╚════██║
                      ██║███████║███████║╚██████╔╝███████╗███████║
                      ╚═╝╚══════╝╚══════╝ ╚═════╝ ╚══════╝╚══════╝
</pre>

### THE ANTI AI SLOP PROTOCOL, LETS MAKE INTERNET HUMAN AGAIN.

<img src="https://readme-typing-svg.demolab.com?font=JetBrains+Mono&weight=600&size=20&duration=2600&pause=900&color=00E5A0&center=true&vCenter=true&width=760&lines=git+commit+-m+%22fix+auth%22;scan+the+QR+in+your+terminal;show+your+face;signature+released.+a+human+was+here." alt="typing" />

<br/>

[![ETHGlobal Lisbon](https://img.shields.io/badge/ETHGlobal-Lisbon%202026-FF3864?style=for-the-badge&labelColor=0D1117)](https://ethglobal.com/events/lisbon2026)
[![World AgentKit](https://img.shields.io/badge/World-AgentKit-000000?style=for-the-badge&labelColor=0D1117)](https://docs.world.org/agents/agent-kit/integrate)
[![Selfie Check](https://img.shields.io/badge/World-Selfie%20Check%20Beta-00E5A0?style=for-the-badge&labelColor=0D1117)](https://docs.world.org/world-id/credentials/11)
[![EU AI Act](https://img.shields.io/badge/EU%20AI%20Act-Article%2050(4)-1E5AFF?style=for-the-badge&labelColor=0D1117)](https://ai-act-service-desk.ec.europa.eu/en/ai-act/article-50)

</div>

---

## The problem, stated plainly

Nobody knows who wrote your code anymore, and the tools we use to signal trust all broke at the same time.

The green squares on your profile used to mean something. Now anyone can point an agent at a repo overnight and wake up to two hundred commits. A contribution graph tells you how much compute someone rented, not what they can do. Recruiters still read it like a CV.

Maintainers took the hit first, and they are done being polite about it:

- **curl** killed its bug bounty in January and stopped vulnerability processing entirely for July 2026.
- **Godot** auto-bans vibe-coded pull requests, saying out loud that AI cannot take responsibility for its code.
- **Codeberg** members voted 358 to 144 to ban AI-heavy projects.
- **Log4j** got 50 bounty reports against 20 real bugs and added an `AGENTS.md` asking agents to stop.
- A **matplotlib** maintainer closed an AI bot's PR, so the bot published a blog post accusing him of discriminating against AI.

Meanwhile GitHub's own "Verified" badge proves a key signed a commit. It does not prove a person was there, did not prove it before agents existed, and definitely does not now. A leaked token and a bored agent produce the same green checkmark you do.

We are not trying to ban agents. Agents are good at writing code. What is missing is a way to say *this specific change had a human behind it, at that moment, and here is the proof*.

<br/>

## What this does

A signing agent that will not hand back a signature until a real human proves they are present. You point git at it instead of your usual SSH agent.

```console
$ git commit -m "harden token refresh"

  commitment issues
  ─────────────────
  policy      src/auth/** requires a live human
  commit      4f2c1ab  (diff 0x9e3a…c14)
  window      60s

  ▄▄▄▄▄▄▄ ▄  ▄ ▄▄▄ ▄▄▄▄▄▄▄
  █ ▄▄▄ █ ▀█▄█▀▄█▀ █ ▄▄▄ █     scan with World ID app
  █ ███ █ █▄ ▄▀▄▄█ █ ███ █
  █▄▄▄▄▄█ ▀▄█▀▄ ▄▀ █▄▄▄▄▄█     waiting for a face…
  ▄▄▄▄▄ ▄▄▀▄█▀▄▀▄▄▄▄▄▄ ▄▄▄
   ▀▀▀▄█▄▀ ▄▀█▄▀▄█ ▄▀▀▄█▀▄

  ✓ liveness verified            1.9s
  ✓ nonce matches, age 4s
  ✓ budget 4/25 today
  → signature released
```

Then on GitHub, a check tells a reviewer what they are actually looking at before they read a single line.

> [!NOTE]
> **Commitment Issues** &nbsp;·&nbsp; 3 of 3 protected commits carry a fresh human proof
> 1 agent commit unattended, allowed by policy (`docs/**`)
> Human budget: 4 of 25 used today &nbsp;·&nbsp; [full receipt](.)

<br/>

## How it works

```mermaid
sequenceDiagram
    autonumber
    actor Dev as You, or your agent
    participant Git as git
    participant CI as commitment agent
    participant Phone as World ID app
    participant GH as GitHub check

    Dev->>Git: git commit -m "harden token refresh"
    Git->>CI: sign this (commit SHA + diff hash)
    CI->>CI: read .commitment.yml, is proof required here?
    CI-->>Dev: QR in the terminal, 60 second window
    Dev->>Phone: scan, show face
    Phone-->>CI: proof (nullifier + our nonce echoed back)
    CI->>CI: verify proof, match nonce, check age, check budget
    CI-->>Git: signature released
    Git->>GH: push
    GH->>GH: replay attestations against policy
    GH-->>Dev: green, with a receipt a reviewer can read
```

Three things are bound together in one attestation: **who** (an anonymous World ID nullifier, no personal data), **what** (the commit SHA and a hash of the diff), and **when** (a single-use nonce we minted seconds earlier). Break any one of them and the proof fails.

<br/>

## You decide how much proof

This is the part that matters for anyone past a weekend project. Requiring a selfie on every commit is obnoxious and nobody would ship it. So the default is zero, and you opt in to the paths where being wrong is expensive.

```yaml
# .commitment.yml
version: 1

require_human:
  - paths: ["src/auth/**", "**/*.sol", "infra/**"]
    proof: selfie           # liveness. no Orb needed, works for any contributor
    max_age: 60s            # minted for this commit. a stale proof is a dead proof

  - paths: ["release/**", ".github/workflows/**"]
    proof: orb              # highest assurance we can ask for
    approvers: 2            # two humans, two different nullifiers

budget:
  # one tired human should not be able to bless a thousand agent commits
  per_human_per_day: 25
  scope: all_agents_behind_that_human

agents:
  allow_unattended: ["docs/**", "**/*.test.ts", "*.md"]
  block_unattended: ["src/auth/**", "**/*.sol"]
```

A solo dev can set this to two paths and forget about it. A company can pin it to their risk classes and enforce it in CI with no new vendor, no seats, and no identity database, because there is nothing to store. The proof is a nullifier and a hash.

That budget line is the piece we care most about. A human presence check that can be spammed is theatre. Because AgentKit counts usage per human rather than per key, the limit follows the person across every agent and machine they run, so rubber-stamping becomes a thing you spend rather than a thing you shrug at.

<br/>

## The regulation angle, stated accurately

**Article 50 of the EU AI Act applies from 2 August 2026.** Plenty of projects are about to describe this wrongly, so here is what it actually says.

It does not require you to prove which lines of your codebase were written by AI. It is a content transparency rule. What is genuinely interesting for us is the shape of the exemption in Article 50(4), where the disclosure duty falls away:

> where the AI-generated content has undergone a process of **human review or editorial control** and where a natural or legal person **holds editorial responsibility** for the publication of the content

So European law now names "a human reviewed this and somebody is responsible for it" as the thing that buys you an exemption, and provides no mechanism at all to prove it. That is the gap. Not a compliance product, just a primitive that fits a hole the law left open.

Sources: [Article 50 text](https://ai-act-service-desk.ec.europa.eu/en/ai-act/article-50) · [Commission FAQ](https://digital-strategy.ec.europa.eu/en/faqs/transparency-obligations-under-article-50-ai-act) · [Transparency guidelines](https://digital-strategy.ec.europa.eu/en/policies/guidelines-transparency-ai-generated-content)

<br/>

## Stack

Built on World's newest surfaces, most of which shipped in the last few months and have almost nothing built on them yet.

| Piece | What we use it for |
|---|---|
| **AgentKit** `0.2.0` | The agent carries a delegated, human-backed credential. `verifyAgentkitSignature()` then `agentBook.lookupHuman()` returns an anonymous `humanId` |
| **AgentBook** | On World Chain at [`0xA23aB2712eA7BBa896930544C7d6636a96b944dA`](https://worldscan.org/address/0xA23aB2712eA7BBa896930544C7d6636a96b944dA) |
| **Selfie Check** (beta) | The liveness credential. `selfieCheckLegacy` preset, `allow_legacy_proofs: true` |
| **IDKit** `4.2.x` | Proof request, `connectorURI` rendered as a terminal QR, `pollUntilCompletion()` |
| **human-in-the-loop** `0.2.1` | `requestHumanAuthorization()` pauses an agent mid-run until a fresh proof lands |
| **GitHub Actions** | Replays attestations against `.commitment.yml` and blocks the merge when policy is not satisfied |

<br/>

## Quickstart

```bash
# 1. install
npm i -g @commitment-issues/cli

# 2. point git at us instead of your usual signer
commitment init                 # writes .commitment.yml and sets gpg.program

# 3. register the agent that will be asking (needs an Orb-verified World ID, once)
npx @worldcoin/agentkit-cli register $(commitment agent-address)

# 4. commit something in a protected path
git commit -m "harden token refresh"
```

To enforce it on pull requests, drop in the action:

```yaml
# .github/workflows/commitment.yml
name: commitment issues
on: [pull_request]
jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with: { fetch-depth: 0 }
      - uses: Commitment-Issues-Protocol/verify-action@v1
```

<br/>

<details>
<summary><b>Things that cost us hours, so they do not cost you any</b></summary>

<br/>

Everything below is from building this over one weekend against the beta SDKs. It doubles as our written feedback for the Selfie Check beta track.

- **There is no laptop webcam path, and there never will be.** We grepped the shipped `@worldcoin/idkit-core` bundle: no `getUserMedia`, no `mediaDevices`, no camera permission request anywhere. Capture happens inside the World ID app on a phone. Hitting `world.org/verify` from a desktop browser just redirects to a download page. The terminal QR is not a workaround, it is the only design, and it turned out to be the better demo anyway.
- **`idkit-core` will not load in Node without a shim.** It fetches its WASM over a `file://` URL, which Node refuses. About ten lines to patch. Nothing in the docs mentions this because nobody expected a CLI.
- **The verify endpoint does not check your nonce.** It validates the proof. It does not confirm the nonce inside it is the one you minted. You have to compare that yourself. Miss it and your entire "a human was here just now" claim silently means nothing.
- **Check `enable_face_check` before you write any client code.** `POST https://developer.world.org/api/v1/precheck/{app_id}` with `{"action":"..."}`. A valid app, rp and action does not imply access to the credential. If it is false, the flow hangs as an unexplained spinner and you will blame your own code.
- **Selfie Check is World ID 3.0 only.** You need `allow_legacy_proofs: true` and the `selfieCheckLegacy` preset. Identity Check is the reverse, 4.0 only, so the two cannot share a request.
- **AgentKit registration needs an Orb.** Selfie Check cannot register an agent. Do this first, because everything else depends on it.
- **Pin `4.x`.** Every IDKit sample older than that on the internet is v2 or v3 and will not work.

</details>

<details>
<summary><b>Threat model, and what this does not prove</b></summary>

<br/>

Worth being honest about the limits, because a reviewer will find them anyway.

**What a proof means:** a unique human, anonymous to us, was live in front of a camera within 60 seconds of this exact diff being signed, and they have spent one unit of a daily budget that follows them across every machine and agent they operate.

**What it does not mean:** that they read the diff. Presence is not comprehension, and no cryptography fixes that. What the budget does is make indiscriminate approval costly enough to be a decision. Binding the proof to the diff hash means at minimum they were shown a specific change rather than blanket-signing a session.

**Not addressed:** a coerced human, a human who genuinely does not care, or a compromised machine that shows one diff and signs another. The last one is the interesting one and it is where we would go next.

</details>

<br/>

## Status

Built at ETHGlobal Lisbon, 24 to 26 July 2026. It is a weekend old. The signing path, the liveness gate, the nonce and freshness checks, the policy engine and the pull request check all work. Treat the rest as intent.

<div align="center">

**Targeting** &nbsp;·&nbsp; World AgentKit New Use Cases &nbsp;·&nbsp; World Selfie Check Beta

<br/>

Built by humans. Provably, which is sort of the point.

</div>
