# Extend the 9 PM steps Shortcut

The shortcut you already run at 9:00 PM posts steps. These steps add runs and heart rate to that same post. Do not make a second shortcut.

The address stays:

`https://resonance3.vercel.app/api/fitness/ingest`

Open the **Shortcuts** app. Tap the shortcut that already runs at 9:00 PM (it is named **Resonance Nightly** if you used the setup on the Fitness page).

## Heart rate

1. Tap the shortcut so it opens for editing.
2. Tap **Add Action**. Search **Find Health Samples**. Tap **Find Health Samples**.
3. Tap the sample type. Choose **Resting Heart Rate**.
4. Tap **Add Filter**. Tap **Start Date**. Tap **is in the last**. Set the number to **2** and the unit to **days**.
5. Tap the action, then **Set Variable**. Name it **Resting Samples**.
6. Tap **Add Action**. Search **Get Details of Health Samples**. Tap it. (If you only see **Get Details of Health Sample**, use that.)
7. Tap the detail and choose **Value**. Make sure it reads **Resting Samples**.
8. Tap **Set Variable**. Name it **Resting Values**.
9. Add another **Get Details of Health Samples**. Choose **Start Date**. Point it at **Resting Samples** again.
10. Tap **Set Variable**. Name it **Resting Starts**.
11. Do not add Format Date, Sort, or Filter between Value and Start Date.
12. Repeat steps 2–10 for **Heart Rate**. Name the variables **Heart Samples**, **Heart Values**, and **Heart Starts**.

The first time, the iPhone asks for Health access. Turn on **Resting Heart Rate** and **Heart Rate**, then tap **Allow**. If you have no Apple Watch, those lists are often empty. Leave them empty. Do not type 0.

## Runs

Nike Run Club writes a run into Apple Health only after you allow it. In **Nike Run Club**, open your profile, tap **Settings**, tap **Partners**, tap **Apple Health**, and turn on saving workouts. Then come back to Shortcuts.

13. Tap **Add Action**. Search **Find Workout**. Tap **Find Workout** from the free **Actions** app. It is not in the built-in Health list.
14. Tap **Add Filter**. Tap **Start Date**. Tap **is in the last**. Set **2** and **days**.
15. If **Find Workout** shows a **Type** filter, set it to **Running**.
16. Tap **Set Variable**. Name it **Run Workouts**.
17. Tap **Add Action**. Search **List**. Tap **List**. Leave the list empty.
18. Tap **Set Variable**. Name it **Run Rows**.
19. Tap **Add Action**. Search **Repeat with Each**. Tap **Repeat with Each**. Set the list to **Run Workouts**.
20. Inside the repeat, tap **Add Action**. Search **Dictionary**. Tap **Dictionary**. Add these keys. For each value, tap the field, tap **Repeat Item**, then tap the property:

    - Key `date`. Type **Text**. Property **Start Date**, then tap that date and choose **Format Date**. Tap **Date Format**, choose **Custom**, and enter `yyyy-MM-dd`.
    - Key `start`. Type **Text**. Property **Start Date**. Leave the phone’s date text as it is.
    - Key `distance`. Type **Text**. Property **Distance**. If you see **Total Distance** instead, use that. If a unit choice appears, choose **mi**.
    - Key `duration`. Type **Text**. Property **Duration**.
    - Key `durationUnit`. Type **Text**. Value `s`.
    - Key `avgHr`. Type **Text**. Property **Average Heart Rate**. If that property is not in the list, delete this key.

21. Do not add a pace key. The floor works pace out from distance and duration.
22. Still inside the repeat, tap **Add Action**. Search **Add to Variable**. Tap **Add to Variable**. Choose **Run Rows**. Add the dictionary you just made.
23. You should see **End Repeat** under that. Leave it there.

If **Distance** is not on the repeat item, delete the runs keys and the repeat, and keep the heart steps. The Runs card will say **not recorded** until distance is available.

## The post you already have

Find the **Get Contents of URL** action that is already in this shortcut. Do not change its address or the steps fields.

24. Tap **Get Contents of URL**.
25. Confirm the URL is `https://resonance3.vercel.app/api/fitness/ingest`.
26. Tap **Show More**.
27. Confirm **Method** is **POST**.
28. Under **Headers**, if there is no header named `Authorization`, tap **Add new header**.
    - Key: `Authorization`
    - Value: `Bearer <fitness-token>`
    - `<fitness-token>` means the token this shortcut already uses. Type the word Bearer, a space, then paste that token. Do not invent a token and do not paste any other secret.
29. If a header named `X-Fitness-Token` is already there, leave it.
30. Confirm **Request Body** is **JSON**.
31. Leave the steps fields as they are (`source`, and `metrics` or `values` and `starts`).
32. Tap **Add new field**.
    - Name: `restingHr`
    - Type: **Text**
    - Value: insert **Resting Values**
33. Add a field.
    - Name: `restingStarts`
    - Type: **Text**
    - Value: insert **Resting Starts**
34. Add a field.
    - Name: `avgHr`
    - Type: **Text**
    - Value: insert **Heart Values**
35. Add a field.
    - Name: `avgStarts`
    - Type: **Text**
    - Value: insert **Heart Starts**
36. Add a field.
    - Name: `runs`
    - Tap the type and change it to **Array**
    - Value: insert **Run Rows**
37. Tap **Done**.

The 9:00 PM automation is already there. Leave it. The next run sends steps, and also runs and heart rate when Health has them.

An empty heart list is normal without an Apple Watch. The Heart card says **not recorded** until a real sample arrives. A second run of the same shortcut does not add the same run twice.
