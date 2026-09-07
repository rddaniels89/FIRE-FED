# Arranging the practitioner review

ROADMAP item 48 needs a person who has administered or advised on FERS
benefits to read `METHODOLOGY-REVIEW.md`, work through the worksheet in
`REVIEW-WORKSHEET.md`, and tell us where the model is wrong. This file is the
plan for getting that done: who to ask, what to send, and how to run it.
Nothing here has been sent yet; sending is your call.

## Candidates

Ranked by fit. Each has public reach to federal employees, which also makes a
completed review worth citing.

| Candidate | Why | How to reach |
|---|---|---|
| Dan Jamison, CPA — FERSGUIDE | Author of the FERSGUIDE and the Special Category Employees edition for 25+ years; retired FBI special agent accountant; publishes his own comprehensive calculator. The strongest reviewer for special-provision, SRS, and divorce/survivor rules. His practice is limited to the guide and divorce work, so a paid technical review fits his model. | dan@fersguide.com · 804-364-7175 · https://fersguide.com/about-dan/ |
| Tammy Flanagan — Retire Federal, Tammy Flanagan LLC | Former FBI retirement benefits specialist (since 1985), GovExec columnist, trainer for the NARFE Federal Benefits Institute and Plan Your Federal Retirement. The strongest reviewer for eligibility, FEHB, and the practical edge cases retirees actually hit. | Contact form at https://www.retirefederal.com/ (first contact is with Karen, their coordinator) |
| NARFE Federal Benefits Institute | The association's benefits experts (Mark Keen, CFP, and Tammy Flanagan present for them). A NARFE review or webinar mention would reach the largest retiree audience. Membership required for consultations. | https://www.narfe.org/federal-benefits-institute/ |
| Chris Kowalik — ProFeds / FedImpact | Runs agency-contracted retirement training nationwide; a reviewer with a trainer's eye for what employees misunderstand. | workshops@profeds.com · 844-776-3337 · https://fedimpact.com/about/ |
| A ChFEBC near you | The Chartered Federal Employee Benefits Consultant directory lists designation holders by state; useful as a second reviewer or if the names above decline. | https://chfebc.com/find-a-chfebc-near-you/ |

Recommendation: ask Dan Jamison first for the rules review (his calculator makes
him the closest thing to a peer), and Tammy Flanagan second for the
eligibility and FEHB pass. Two reviewers who disagree on a rule is a finding.

## What to send

1. `docs/METHODOLOGY-REVIEW.md` — the packet.
2. `docs/REVIEW-WORKSHEET.md` — the rule-by-rule form to fill in.
3. Read access to the branch, or a hosted preview URL with a Pro-enabled
   test account, so they can reproduce any number with the "How was this
   calculated" control and the assumptions page.
4. The three OPM-style worked examples in
   `src/lib/calculations/__tests__/goldenCases.test.js`, exported as a short
   PDF if they do not want to read tests.

## Draft outreach email

Subject: Paid technical review of a FERS retirement model (2 to 4 hours)

> Hello [name],
>
> I build FireFed, an educational planning tool for FERS employees that models
> the whole path from today through separation and retirement: every FERS
> retirement path, the Special Retirement Supplement and its earnings test,
> FEHB continuation, TSP access rules, Social Security claiming, taxes, and
> healthcare, in one year-by-year projection.
>
> Before I describe it as reviewed, I want someone who has administered these
> benefits to check it. I have written a review packet that states each rule
> as implemented, cites the source I used, and lists the simplifications, plus
> a one-page worksheet for recording where you agree, disagree, or would
> qualify. I estimate two to four hours. I will pay your consulting rate and
> publish your findings, including the ones that say I got something wrong,
> with attribution if you want it or anonymously if you prefer.
>
> Would you be open to this? I can send the packet and a preview login the
> same day.
>
> [name, contact]

## How to run it

1. Agree scope, rate, and a two-week window in writing.
2. Send the packet, worksheet, and preview access.
3. Take every disagreement as a GitHub issue tagged `practitioner-review`,
   each with the reviewer's wording and the rule id from
   `src/lib/rules/registry.js`.
4. Fix or document each one; a rule we keep against advice gets a caveat in
   the registry and on the assumptions page.
5. Publish a "Reviewed by" section on the assumptions page: reviewer, date,
   what was reviewed, what changed, and a link to the worksheet.
6. Update `lastVerified` on every reviewed rule.
