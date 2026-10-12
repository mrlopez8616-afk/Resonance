# Resonance Nightly

Build one new shortcut named **Resonance Nightly**. It posts steps, resting heart rate, heart rate, and runs.

Address: `https://resonance3.vercel.app/api/fitness/ingest`

## Put the token on the phone

1. Open Safari. Go to `https://resonance3.vercel.app`.
2. Sign in.
3. If the floor says Public, turn Public mode off. The button is hidden in Public mode.
4. Tap **Fitness**.
5. Tap **Copy token**. The token is copied. The page does not show it.
6. Stay on the phone. The next steps paste that copy.

## The shortcut

7. Open the **Shortcuts** app.
8. Tap **+**.
9. Tap the name at the top. Type `Resonance Nightly`.
10. Tap **Add Action**. Search **Text**. Tap **Text**.
11. Type `Bearer ` (the word Bearer, then one space). Paste the token right after that space.
12. Tap that action. Tap **Set Variable**. Name it `Auth`.
13. Tap **Add Action**. Search **Find Health Samples**. Tap **Find Health Samples**.
14. Tap the type. Choose **Steps**.
15. Tap **Add Filter**. Tap **Start Date**. Tap **is in the last**. Set **2** and **days**.
16. Tap **Add Action**. Search **Get Details of Health Samples**. Tap it. If you only see **Get Details of Health Sample**, use that.
17. Tap the detail. Choose **Start Date**. It must use the Steps samples from step 13.
18. Tap **Add Action**. Search **Find Health Samples**. Tap **Find Health Samples**.
19. Tap the type. Choose **Resting Heart Rate**.
20. Tap **Add Filter**. Tap **Start Date**. Tap **is in the last**. Set **2** and **days**.
21. Tap **Add Action**. Search **Get Details of Health Samples**. Tap it.
22. Tap the detail. Choose **Start Date**. Point it at the Resting Heart Rate samples from step 18.
23. Tap **Add Action**. Search **Find Health Samples**. Tap **Find Health Samples**.
24. Tap the type. Choose **Heart Rate**.
25. Tap **Add Filter**. Tap **Start Date**. Tap **is in the last**. Set **2** and **days**.
26. Tap **Add Action**. Search **Get Details of Health Samples**. Tap it.
27. Tap the detail. Choose **Start Date**. Point it at the Heart Rate samples from step 23.
28. Tap **Add Action**. Search **Find Workout**. Tap **Find Workout** from the free **Actions** app. It is not in the built-in Health list.
29. Tap **Add Filter**. Tap **Start Date**. Tap **is in the last**. Set **2** and **days**.
30. If a **Type** filter is there, set it to **Running**.
31. Tap **Add Action**. Search **List**. Tap **List**. Leave the list empty.
32. Tap **Set Variable**. Name it `Runs`.
33. Tap **Add Action**. Search **Repeat with Each**. Tap **Repeat with Each**. Set the list to the **Find Workout** result.
34. Inside the repeat, tap **Add Action**. Search **Dictionary**. Tap **Dictionary**. Add these keys. For each value, tap the field, tap **Repeat Item**, then the property.

    - Key `start`. Type **Text**. Property **Start Date**.
    - Key `distance`. Type **Text**. Property **Distance**. If you see **Total Distance**, use that. If a unit choice appears, choose **mi**.
    - Key `duration`. Type **Text**. Property **Duration**.
    - Key `durationUnit`. Type **Text**. Value `s`.
    - Key `avgHr`. Type **Text**. Property **Average Heart Rate**. If that property is missing, delete this key.

35. Still inside the repeat, tap **Add Action**. Search **Add to Variable**. Tap **Add to Variable**. Choose **Runs**. Add the dictionary.
36. Leave **End Repeat** under that.
37. Tap **Add Action**. Search **Get Contents of URL**. Tap **Get Contents of URL**.
38. Set the URL to `https://resonance3.vercel.app/api/fitness/ingest`.
39. Tap **Show More**.
40. Set **Method** to **POST**.
41. Under **Headers**, tap **Add new header**. Key: `Authorization`. Value: the **Auth** variable.
42. Set **Request Body** to **JSON**.
43. Add these fields. Health fields are **Text**. Runs is **Array**.

    - `source` — **Text** — `shortcuts`
    - `steps` — **Text** — the **Find Health Samples** result whose type is **Steps** (the samples, not the Start Date)
    - `stepStarts` — **Text** — the Steps **Start Date** from step 16
    - `resting` — **Text** — the **Find Health Samples** result whose type is **Resting Heart Rate**
    - `restingStarts` — **Text** — that **Start Date**
    - `heart` — **Text** — the **Find Health Samples** result whose type is **Heart Rate**
    - `heartStarts` — **Text** — that **Start Date**
    - `runs` — **Array** — **Runs**

44. Tap **Done**.

The first time, the iPhone asks for Health access. Turn on **Steps**, **Resting Heart Rate**, and **Heart Rate**, then tap **Allow**. Allow the **Actions** app to read workouts.

In **Nike Run Club**, open your profile, tap **Settings**, tap **Partners**, tap **Apple Health**, and turn on saving workouts.

Do not sort the samples. Do not type 0. An empty heart list is normal without an Apple Watch. The Heart card says **not recorded** until a real sample arrives. If **Distance** is not on the repeat item, delete steps 28–36 and the `runs` field. Runs stays **not recorded**. A second run does not add the same run twice.

## 9:00 PM

45. Tap the **Automation** tab.
46. Tap **+**.
47. Tap **Time of Day**.
48. Set **9:00 PM**. Set **Repeat** to **Daily**.
49. Turn **Run Immediately** on. If you see **Ask Before Running**, turn that off.
50. Tap **Next** if it is there.
51. Choose **Resonance Nightly**.
52. Tap **Done**.

## No link from this computer

An iCloud shortcut link is created only when the Shortcuts app on an iPhone, iPad, or Mac shares the shortcut. This computer cannot do that.

A `.shortcut` file from iOS 15 onward is a signed Apple Encrypted Archive. The iPhone will not import an unsigned file written here. Signing needs the Shortcuts app on a Mac (`shortcuts sign`) or the Share sheet on the phone. Neither is available here, so there is no file to tap. Build it from the steps above.
