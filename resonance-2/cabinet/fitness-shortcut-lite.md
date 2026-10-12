# Resonance Nightly

One new shortcut. It sends today's step total. It does not send Health sample lists.

Address: `https://resonance3.vercel.app/api/fitness/ingest`

If you already have a **Text** action that says `Bearer ` and your token, keep that action. Skip steps 4–6.

## Token

1. Open Safari. Go to `https://resonance3.vercel.app`. Sign in.
2. Turn Public mode off if it is on.
3. Tap **Fitness**. Tap **Copy token**. The page does not show the token.

## Shortcut

4. Open the **Shortcuts** app. Tap **+**.
5. Tap the name. Type `Resonance Nightly`.
6. Tap **Add Action**. Search **Text**. Tap **Text**. Type `Bearer ` (Bearer, then one space). Paste the token after the space.
7. Tap **Add Action**. Search **Find Health Samples**. Tap **Find Health Samples**.
8. Tap the type. Choose **Steps**.
9. Tap **Add Filter**. Tap **Start Date**. Tap **is today**.
10. Tap **Add Action**. Search **Calculate Statistics**. Tap **Calculate Statistics**.
11. Set the operation to **Sum**. The input is the Steps samples from step 7.
12. Tap **Add Action**. Search **Format Date**. Tap **Format Date**.
13. Set the date to **Current Date**. Tap **Date Format**. Choose **Custom**. Enter `yyyy-MM-dd`.
14. Tap **Add Action**. Search **Get Contents of URL**. Tap **Get Contents of URL**.
15. Set the URL to `https://resonance3.vercel.app/api/fitness/ingest`.
16. Tap **Show More**. Set **Method** to **POST**.
17. Under **Headers**, tap **Add new header**. Key: `Authorization`. Value: the **Text** from step 6.
18. Set **Request Body** to **JSON**. Add these fields:

    - `source` — type **Text** — value `shortcuts`
    - `date` — type **Text** — value the **Formatted Date** from step 12
    - `steps` — type **Number** — value the **Statistics** sum from step 10

19. Tap **Done**.

The first time, allow **Steps** when the iPhone asks. Do not type 0.

## 9:00 PM

20. Tap the **Automation** tab.
21. Tap **+**.
22. Tap **Time of Day**.
23. Set **9:00 PM**. Set **Repeat** to **Daily**.
24. Turn **Run Immediately** on. If you see **Ask Before Running**, turn that off.
25. Tap **Next** if it is there.
26. Choose **Resonance Nightly**.
27. Tap **Done**.

Runs can be added later. This shortcut only sends the day's step total.
