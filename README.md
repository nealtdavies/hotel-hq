# Hotel HQ

A browser game about running a hotel. Check guests in, keep rooms clean, build a rota, service your equipment and decide what to do when things go wrong (trashed rooms, lost pets, boiler breakdowns, green pools and many more).

No server, no accounts, no build step. It is plain HTML, CSS and JavaScript, and the game saves in the browser.

## How the game grows

You start as a **Boutique Hotel**: 24 rooms (16 garden-view Standard, 8 sea-view Ocean View), 9 staff, £15,000 and basic equipment. The hotel doubles in room count at each level. Hit a level's goals (days played, guest rating, average weekly profit) and investors pay a grant and unlock the next level: new room types, facilities, and higher room and staff limits.

| Level | Room / staff limit | Room types | Facilities unlocked | Goals to reach it | Grant |
|---|---|---|---|---|---|
| Boutique Hotel (3-star) | 24 / 20 | Standard, Ocean View | none (basic equipment only) | start | none |
| Small Hotel (3.5-star) | 48 / 40 | + Family | Restaurant, Heating and air-con | day 14, rating 4.0, £120 a day profit | £30,000 |
| Mid-Size Hotel (4-star) | 96 / 80 | + Luxury Suite (needs a lift) | Pool, Spa, Lift | 38 rooms, day 40, rating 4.2, £450 a day profit | £60,000 |
| Grand Resort (5-star) | 192 / 160 | all four types | none | 77 rooms, day 80, rating 4.4, £1,200 a day profit | £120,000 |

Big hotels have a lot to do, so the Tasks page has **Assign everything** and the Guests page has **Accept all that fit**. The Rooms page has status filters and switches to a compact list over 30 rooms.

Levels, goals, costs and grants live in `TIERS`, `FACILITY_UPGRADES` and `ROOM_BUILD_COST` in `js/data.js`. After changing them run `node tests/balance.js` to check the pacing.

## Panels

The game is organised as five panels that work together, plus detail pages (Rooms, Guests, Tasks, Incidents, Maintenance, Expansion, Finance, Settings).

### Setting up, and Management online and offline

- **Setup walkthrough.** A new player is taken through opening the hotel one step at a time: a welcome, their name, an optional photo, the hotel's name (with a suggest button), a made-up bank (name and colour), a "how it works" page, and a summary. Back never loses an answer (`js/ui-setup.js`).
- **The hotel opens offline.** The button at the top reads **Management Online** while the hotel is paused and **Management Offline** while it is live. Offline, nothing happens: no calls ring, no incidents appear, no guests are taken in. Menus, prices, the rota, staff, rooms, notes, replies and the diary can all be changed in peace. Taking bookings, checking guests in, sending staff to tasks, answering the phone, incidents and the clock are locked, with a message, until Management is online (`LIVE_ACTIONS` and `LIVE_FORMS` in `js/ui-mgmt.js`).
- **Ending the day.** Pressing Management Offline ends the day (the same evening as before, with the day report) and pauses the hotel. The next morning's bookings, calls, requests and incidents are only created when Management goes online, so they have come in "overnight".
- **The real clock.** The date is read from the computer. If more than one real night passes while Management is offline, or the game is left online past midnight, the hotel runs by itself for each extra day, up to three: nobody deals with anything, so problems are ignored, guests come and go and the bills are paid. A "While you were away" screen shows each day. The code is `js/engine-mgmt.js` (rules, no clock reads) and `js/ui-mgmt.js`.
- Older saves open online, so nothing changes for them.

### Dashboard

The hotel picture, every room counted once (occupied, ready, needs cleaning, damaged), free rooms by type, cash flow with tonight's expected close and a 7-day forecast, progress towards the next level, equipment condition, contractors on site and **Team activity**: who is doing which job right now, what is queued, and what you have handled. Whatever you assign from the Inbox or Tasks appears there as it happens. The forecast (`forecastCash` in `js/engine-dashboard.js`) counts guests in the house, confirmed reservations, deposits, meal plans, wages and running costs, and leaves out restaurant takings, extras, event income, new enquiries and no-shows. A test checks it equals the real end of day.

### Team

Tabs: **On shift**, **People**, **14-day rota** and **Recruitment**.

- The day now has a **clock** (06:00 to 23:00). Move it on an hour, three hours, or to close to watch shifts start and jobs finish. The day still ends when you press End day, and the game's rules still settle each day as a whole.
- Everyone works an **Early** (07:00 to 15:00), **Day** (09:00 to 17:00) or **Late** (15:00 to 23:00) shift on the days the rota marks as on. Cards show a headshot, a shift progress bar, what they are doing right now (or what they will do next), their mood and how many jobs they have done. A shift can only change before someone has worked that day.
- The rota repeats every **14 days** (day number mod 14). Tap a cell to flip a day; the page also shows how many of each role are on every day and whether each facility is open.
- **Mood:** working normal days is neutral; a flat-out day, six or more days in a row, and being sick lower it; days off raise it; extremes drift back to the middle. Under 40 raises the daily chance of calling in sick, and under 35 someone tells you in the Inbox.
- Jobs you hand out are placed on the person's timeline (cleaning 45 min, repairs 90, complaints 30, requests 25, servicing 60, incidents 60).

### Bookings

Tabs: **Reservations**, **Dinner**, **Events**, **Room blocks** and **Calendar**. Reservations can be made up to 60 days ahead for any date, with live availability and price as you type: guests, dates, room type or a specific room, a custom rate, meals, extras, deposit, party type and other guests' names, and notes.

- **Edit** changes name, party, dates, nights, rate, meals, extras and notes. The room is kept if it is free for the new dates, otherwise another of its type is chosen, otherwise the change is refused. A smaller total refunds the excess deposit. Changing a booking to today checks the guest in.
- **Requests** (up to 3) such as "Birthday cake". On arrival each becomes a guest request for Reception.
- **Move room** lists every free room for the dates that suits the party. Same type: free swap. **Upgrade:** a free upgrade delights the guest, charging the new rate keeps them neutral. **Downgrade:** reducing the rate softens it, keeping the rate for a lesser room makes the guest angry.
- **Room blocks** take rooms (or all of a type) off sale for 1 to 60 nights with a reason; they are refused if any chosen room has a stay, booking or block then. Enquiries and bookings cannot use blocked rooms. **Allow bookings again** removes a block.
- **Dinner** tables (1 to 12 people, 18:00 to 21:00, up to 30 days ahead). Reserved tables are served first each evening and one party in ten does not turn up. Each chef on shift seats 30. Tables on a day the restaurant cannot open are cancelled.
- **Calendar** shows free rooms by type for 14 days and a room-by-day grid (guest, booked, blocked, damaged, free).
- Reservation requests also arrive on the Guests page. On the day, check guests in from Bookings. Anyone still waiting in the evening is checked in if a room is ready, or leaves angry (2-star review, deposit refunded). About 4% are no-shows and the deposit is kept.

### Events and Food

Tabs: **Plan**, **Planned**, **Requests**, **Results** and **Menu**.

- **Public events** you sell tickets for: excursion, karaoke evening, buffet evening, theme night (five themes), beach barbecue. Choose the date, ticket price, number of places and advertising (none, posters £60, social media £180, local radio and press £450). A live forecast estimates tickets, guests and profit.
- **Private events** arrive as client **requests**: parties (a Small Hotel or better) and weddings (a Mid-Size Hotel or better), paying an offer per head with a 30% deposit. Accept or decline within a few days.
- **How demand works** (`eventAppeal` in `js/engine-events.js`): tickets sell each morning. A fair price, advertising, a high rating, a bigger hotel and a popular theme all raise demand; overcharging cuts it steeply. Staying guests may buy too. Advertising rarely pays for a small event but does for a big one. Prices and costs for every type are in `EVENT_TYPES` in `js/data.js`.
- **On the night** each event needs a suitable person rostered (a chef, or a receptionist for excursions and karaoke) or it is cancelled and refunded with a bad review. Outdoor events depend on the weather on the night: rain halves the crowd (those who stay home are refunded) and a storm calls a public event off with full refunds (a wedding or party carries on indoors like a wet day). The evening pays door sales and extra spend, charges the costs and leaves a review. Restaurant-venue events close the restaurant to normal diners and dinner tables.
- **Menu:** the menu builder (add, edit, delete and switch off dishes, with your own photos). Every evening guests dine from it; a bigger menu brings more diners, quality and a fair price make guests happier. The **children's menu** (spaghetti bolognese, nuggets, pizza, macaroni cheese, ice cream, doughnuts, cola, orange fizz, milkshake and apple juice) is added with one button; children order only from dishes marked as children's dishes, grown-ups never do, and a children's dish is fairly priced at about 55% of the grown-up price for its course. Any dish of your own can be marked as a children's dish. The restaurant still needs at least one grown-up main course.

### Seasons, weather and prices

- **Seasons.** A year is 112 days of four 28-day seasons, starting in spring. People ask to stay more in summer (125% of a normal day), a little less in autumn (95%) and much less in winter (75%). **Festivals** (Spring Flower Festival, Summer Carnival, Harvest Fair, Winter Lights) multiply that by 1.3 to 1.6 for a few days. Everything is in `SEASONS` and `FESTIVALS` in `js/engine-season.js`.
- **Weather.** Each day is sunny, cloudy, rainy or stormy with odds that depend on the season. It comes from a seed saved with the game, so it is always the same when looked at. The Dashboard shows today and a **4-day forecast**. The forecast is right about 95% of the time a day ahead, 85% three days ahead and 70% a week ahead, and it can change as the day gets closer. Outdoor events sell better in sun and summer and worse in rain and winter; indoor events sell a little better in winter. The Inbox warns when rain or a storm is forecast for an outdoor event in the next two days.
- **Prices.** The number of people asking for a room type depends on its price against the usual rate: about 80% as many at 25% above usual, about 40% more at 20% below (limits 50% to 150%). The Dashboard's **Prices** card suggests raising rooms that are nearly full for three days or ahead of a festival, and lowering rooms that are quiet, always within 80% to 125% of the usual rate so guests do not mind. One tap sets the price for every room of that type. Guests already staying keep the rate they booked at.

### Goals and unlocks

Every pound a hotel earns from guests counts towards a ladder of **goals** (19 of them, from £2,000 up to £5,000,000), shown on the Dashboard with a progress bar. Grants and bonuses do not count, and the total never goes down, so a bad day cannot undo progress. Some goals open an extra for free: the **Arcade** (£5,000), the **Kids Club** (£15,000), the **Souvenir Shop** (£40,000) and **Excursions** (£75,000). The goals after that carry on as long-term targets. They are `MILESTONES` in `js/engine-milestones.js`. Older saves are given every goal they have already earned, without announcements.

**Welcome back.** The first time the game is opened on each real day it shows a welcome screen with a streak of days in a row, a small bonus (£250 a day of the streak, up to 7), the next goal and today's challenges. Missing a day restarts the streak at one.

**Your photo and your bank.** The welcome form takes an optional headshot (kept on the device only; it can also be given to a team member) and a made-up bank: the player names it and picks a colour. The game invents the account number (always starting `HQ`) and never asks for real account or card details.

### Extras

The Extras screen appears once the first goal that unlocks one is reached. Each extra needs its own team member on duty to trade (the Manager cannot stand in), and an arcade with nobody running it does not wear out or break, and each one has a headshot slot in IMAGE-GUIDE.md.

- **Arcade.** Two machines to start with (claw machine, racing game), and a pinball table and dance pad to buy. The machines are equipment, so they wear out, break, appear on the Maintenance page and can be fixed by staff or contractors. Players per day depend on children staying, local visitors (more on wet days and weekends), the price per play and how many machines work.
- **Kids Club.** Families staying with children can be booked in, by hand or automatically. Each leader looks after up to 8 children, so families that do not fit wait and are less happy. The price per child per day is set by the player.
- **Souvenir shop.** Souvenirs, snacks and drinks, and travel basics, each with a price and a stock level. Stock is ordered in packs and sells in proportion to the guests staying. Shoplifting and break-ins are possible, with the choice to call the police.
- **Excursions.** The player names their own trips, picks or invents a category (indoor or outdoor, low, medium or high running cost), sets a ticket price and uploads a picture. Each guide on duty can lead two a day; outdoor trips depend on the weather.

All the figures come from one plan function per extra in `js/engine-fun.js`, so the screens show the same expected numbers the evening uses. New incidents are in `js/scenarios-fun.js`, and each extra adds a daily challenge.

### Phone desk

Guests ring and write while the game is open. A few calls are queued each morning (more in bigger hotels) and ring one at a time, about a minute apart: a **ringing button** shakes on every screen (it holds still for people who ask their device for reduced motion), the phone rings three times, and the Phone tab shows a red badge. It pauses during pop-ups, the guided tour and when the tab is hidden. A call that nobody answers stops ringing and waits; by the next morning it is a voicemail that can be returned for two days (worth half the bonus), and then it is dropped with no penalty. Written messages arrive quietly with a ping.

A caller says what they want in a few sentences. The player writes the guest's name (or taps "Fill it in for me"), picks the room, the day, the nights, the party and any requests they caught (up to 3), and may add a note. The booking is made as entered. The game scores only what was caught, never the spelling: the room, day, nights, adults, children and each request, with a request that was never made counting against. Three stars (everything right) earn £30, a happier guest (+8), and a "Perfect" message; fewer stars earn less, and a booking written down wrongly arrives a little annoyed (-3). A confirmation card (reference number `HQ-xxxxx`, the hotel name and logo, the details and the player's own **welcome message** from the Phone tab) shows after each call. Messages are answered by writing a reply of a few words (£5); any reply counts.

"Suggest a name" buttons are on the booking form (the guest, and the rest of the party with a matching surname), the team member edit form and the hotel name; typing your own always works. People have faces: 36 women and 36 men (`assets/guests/f01..f36.jpg`, `m01..m36.jpg`) and 12 girls and 12 boys (`kf01..kf12.jpg`, `km01..km12.jpg`), picked from each person's name so they always look the same. The caller's face is shown on a call, and every member of a party (children too) has a small face on the Guests screen. Offline storage is now about 20 MB with the faces.

Nothing typed leaves the device. Typed text is length-limited and has tags stripped. A daily challenge asks for a few answered calls. The rules are in `js/engine-phone.js` and the screens in `js/ui-phone.js`.

### Guest book, notes, replies and diary

- **Notes.** Many guests let slip something they like ("Overheard: I can never sleep without extra pillows"). On each guest's card the player can write a note. Notes are never marked; they are only checked for the guest's favourite thing (`GUEST_PREFS` in `js/engine-guestbook.js` lists the eight and the words that count).
- **The guest book.** Guests who check out go in the guest book (up to 60, on the Guests screen) with their note, which can still be edited there. Someone who left happy (55 or more) and has been away three days may ring again, about one call in seven. The call says "It is Mia Hart again", and she keeps her party and the link to her guest-book entry.
- **Being remembered.** When a returning guest checks in, a note that matches what they like delights them (+12 satisfaction, usually a 5-star review that says the hotel remembered); any other note is appreciated (+4); no note is just noted in the Inbox.
- **The review average** on the Guests screen carries the small Trip Scorer logo, a made-up review site (`icons/trip-scorer.png`, transparent, 260 px wide).
- **Replying to reviews.** Each review on the Guests screen can be answered in the player's own words and edited later. The first reply to a review pays £5, for up to three replies a day.
- **The diary.** A "Dear diary" line can be written at the end of each day (in the day report) or from the Diary screen for today. Each day keeps one entry with the day's cash, rating and guests, the last 120 days are kept, and "Export diary" saves it as a text file. Nothing is sent anywhere.

### What guests ask for

A guest can ask for something specific, and the hotel is judged on whether it delivered. A request typed into a booking is read for key words, and the phone desk's "Nice view", "Ground floor" and "Vegetarian meals" count too.

- **A sea view.** Only an Ocean View room gives one. A guest who asked for it and is put in any other room is upset (-10 satisfaction) and a complaint waits in Tasks. If they get it they are pleased (+5).
- **A ground floor room.** Rooms numbered 1xx are on the ground floor. Any other floor is a complaint.
- **Vegetarian meals.** Judged in the evening, once the restaurant has served. With no vegetarian main course on the menu the guest complains (-8); with one they are pleased (+5). A hotel with no restaurant is never asked to feed them, and a closed restaurant is not judged that night.
- **A particular dish by room service.** If the dish has been taken off the menu by the time the order is dealt with, the guest is upset and complains. An order nobody dealt with by the end of the day also becomes a complaint ("it never arrived").

Reservations show a chip when their room would not give what was asked for (for example "Sea view: needs an Ocean View room"), the morning briefing warns about arrivals who would be disappointed, and the guest card shows whether each wish was delivered. A complaint is only ever raised once for each wish, and it is put right like any other complaint (a discount helps). The code is `js/engine-wishes.js` (rules) and `js/ui-wishes.js` (chips).

### Morning briefing and career

The Dashboard has a **Morning briefing** for today (weather and festivals, arrivals and returning guests, expected calls, events tonight, who is off sick, what is broken, today's challenges) and tomorrow (forecast, arrivals, rooms to clean, events, who is off duty). The day report ends with "Tomorrow at a glance". Promotions follow the goals: Trainee, Receptionist (2 goals), Duty Manager (4), Assistant Manager (6), General Manager (9), Regional Manager (12), Hotelier (16) and Hotel Director (19). Each promotion earns a certificate with the player's name, title and hotel, kept in the Goals list. Old saves start at the rank they have already earned, without certificates. See `js/engine-career.js`.

### Inbox

Messages from the team and front desk. **Urgent** ones are red. *Live* messages come from the hotel as it is now (complaints, guest requests, repairs, rooms to clean, incidents, arrivals, enquiries, client requests, worn equipment, cash, tired staff) and disappear when dealt with. *Stored* messages record what happened (reviews, event results, contractors finishing or running late, someone calling in sick, the nightly summary). Messages carry their own actions: pick who does a job (shown with skill and when they are free), offer a discount to a complaining guest, send housekeeping to every dirty room, decide an incident, get contractor quotes, service equipment, accept a client, give a tired person tomorrow off. Everything you do is listed under **Handled** and on the Dashboard.

## Difficulty and guidance

Making money is easy once the basics are covered, and losing everything is hard but possible.

- **Reception books guests for you** (on by default in a new game, switchable in Settings). Anyone waiting to book at the end of the day is accepted if a room fits and a receptionist or manager is on the rota.
- **The bank's lifeline.** When the money runs out the bank steps in twice (`LIFELINE_MAX`, `LIFELINE_CASH` in `js/data.js`), covering the bills so the balance is back to £4,000. Only after both lifelines are used does the hotel go bankrupt. It is shown in the end-of-day report and the Inbox, and does not count as trading income.
- **Getting started** checklist on the Dashboard (six steps, each ticked when done, can be hidden), and one **tip** that fits the moment (cash is low, a complaint is waiting, rooms need cleaning, equipment is worn, someone is tired, try an event, and so on).
- **A headline for every day** ("A steady day", "A great day", "Brilliant day!") in the end-of-day report, with the tip and any awards earned.
- **A guided first day.** A new game starts with a short spotlight tour that points at the next thing to do (open the hotel with Management Online, read a message, take a booking, clean a room, look at the team, close the day with Management Offline). Each step finishes by itself when the player does it, and the tour can be skipped. It reads the same first-steps flags as the checklist. Older saves skip it.
- **Sound effects** for money, messages, awards and level-ups, made with the Web Audio API (no audio files). Switch them off in Settings; the choice is kept per device. Browsers only allow sound after the first tap, so the audio is started from a touch.
- **Daily and weekly challenges** on the Dashboard: two small daily ones (clean sweep, happy guests, busy team, full books, profit target, everyone heard, five-star day) and one weekly (five-star week, an event, profit week, nearly full, equipment service, hard-working week). They are checked as the day ends and pay a cash bonus (£100, £200, £400 or £800 by level, three times that for the weekly) that is not counted as trading profit. Doing a daily challenge on consecutive days builds a streak, with bonuses at 3 and 7 days.
- **Awards** (19, on the Expansion page and announced in the Inbox): first profit, a £1,000 day, full house, a 5-star review, weeks and months in, your first event and wedding, growing a level, savings, top chef and more.

`node tests/balance.js` plays seven styles (the `fun` style also hires for and looks after the extras, and reports what they earn) and reports bankruptcies and lifeline use. Targets: someone who does nothing at all is closed down after about 50 days (using both lifelines); a distracted player (handles a quarter of things) survives; a casual player (handles about 60%) is comfortably profitable; careful players reach the next levels by about days 13, 39 and 79.

## Contractors

When equipment breaks or a room is damaged you can repair it in-house (fast, cheap, uses a staff slot) or hire a contractor. Choose **Get contractor quotes** on a repair task, from a breakdown incident, or on the Maintenance page (for servicing). Eight firms compete on:

- **Price and speed:** an emergency firm is same-day but costs about double, a budget firm is cheap but slow, a premium firm is fast and dear
- **Specialisms:** a firm that specialises in the trade (heating, pool, lift, plumbing and so on) does better work and charges less. Some firms do not do some trades at all
- **Track record:** the rating a firm advertises is not always its real standard. The directory shows how each firm has actually treated you
- **Guarantee:** a firm may guarantee its repairs for a number of days. If the same fault returns inside the guarantee, they come back free

The work takes days. Until it is finished the equipment stays broken (guests keep losing happiness and facilities stay shut), and a damaged room cannot be rented. You pay when the work is done. Firms can run late, and each job rolls a hidden outcome: excellent, good, poor (looks fixed but breaks again within a week) or failed (not fixed, you pay only a call-out share). Odds come from the firm's real rating, with a bonus for specialists (`FIRMS`, `OUTCOME_ODDS` in `js/data.js`).

## Design and devices

`css/style.css` is a small design system: colour, radius and shadow tokens at the top, light and dark themes that follow the device, and one set of components. The layout is phone first and adapts to three sizes:

| Width | Navigation |
|---|---|
| Under 700px (phones) | Bottom tab bar with five tabs (Dashboard, Team, Bookings, Events, Inbox) and a More sheet, floating Management Online/Offline button, dialogs open as bottom sheets, safe-area padding for notches and home bars |
| 700 to 1099px (iPad portrait) | Slim icon rail on the left |
| 1100px and up (laptop, iPad landscape) | Labelled sidebar in groups |

Touch screens get 44px minimum controls, and form fields use 16px text so iOS does not zoom. `tests/ui.test.js` opens every screen at phone, small phone, iPad portrait, iPad landscape and laptop sizes and fails on any sideways scrolling or wrong navigation. The navigation list is the `NAV` and `PHONE_TABS` arrays in `js/ui.js`.

Planned for the native iPhone and Android apps: wrap this site with Capacitor, add a web app manifest, icons and offline caching, and keep saved games behind `writeSave`/`loadSave` so the storage can be swapped for the phone's own.

## People and names

Every guest, staff member, candidate and contractor engineer is drawn from `data/names-source.pdf` (1,000 gender-labelled first names and 1,000 surnames). `node tools/make-names.js` converts it into `js/names-data.js`; 11 fragments in the surname column ("Da", "de", "Le", "van") are left out because they are not surnames.

- A full name is never used twice in one save (`namesUsed`), and a name you type by hand is never duplicated by a random draw while that guest is present.
- Men and women draw from their own gender pool, with a 6% chance of a unisex name. Staff gender follows the portrait.
- Parties follow surname logic. Families, single parents with children, siblings and married couples share a surname. Unmarried couples, friends and colleagues never do. About 12% of couples are two men or two women.
- On the booking form, Party type and Other guests' names are optional. Names you type are kept exactly as typed. Without a surname, a related guest gets the lead's surname and an unrelated guest gets a different one.
- `js/names.js` holds the rules (no DOM access).

## Run it

Open `index.html` in a browser. To put it online, upload this whole folder to any static host. Free options include GitHub Pages and Cloudflare Pages (check each provider's current free-tier terms).

## Install and play offline

The game is a web app that can be installed. Open it from a web address (not straight from a file) in Chrome, Edge or Safari and use "Install" or "Add to Home Screen". The page, scripts and styles are stored the first time it loads, so it opens and plays with no connection. Settings has a "Play offline" card that shows whether this is ready and can store all the pictures too (about 20 MB). Pictures you have already seen are stored automatically. Saves live in the browser's local storage on that device and are not shared between devices.

`sw.js` holds the list of stored files and a version taken from their contents. After changing any game file run `node tools/make-sw.js` so players receive the update and old copies are removed; `node tools/make-sw.js --check` says whether it is up to date (the PWA test fails if it is not). The game logo is `icons/logo.png` (welcome form) and `icons/logo-small.png` (side menu), cut from the original in `icons/source/logo-original.png`; they are stored for offline play with the other icons. `python3 tools/make-icons.py` rebuilds every icon from the master artwork in `icons/source/` (the Luxury Hotel Manager icon pack). The pack's square icons have a rounded tile and dark margin baked in, which phones would show as a dark frame, so the margin is cropped off; the maskable and Android foreground art is shrunk to keep the key inside the area every launcher shape leaves visible.

## Phone apps (iOS and Android)

The same game can be wrapped as a store app with Capacitor (`capacitor.config.json`, app id `com.hotelhq.game`).

```
npm install
npm run sync          # builds www/ from the game files and copies it into the native projects
npx cap add ios       # once; needs a Mac with Xcode
npx cap add android   # once; needs Android Studio
npm run icons         # puts the game's icons into the new ios/ and android/ projects (needs Python with Pillow)
npx cap open ios      # or: npx cap open android
```

`icons/native/` holds the 1024 iOS icon, the 512 Google Play listing icon and the Android adaptive layers at every density. The Play listing icon is uploaded in the Play Console, not built into the app.

What has and has not been checked:
- The Capacitor configuration was checked with the real command line: `npm install`, `cap add android`, `cap add ios` and `cap sync android` all complete. Nothing has been built or run as an app, because that needs Xcode and the Android SDK, so it has not been tried on a phone or a tablet.
- Inside an app the service worker is not used (the web view does not support it); the files are already inside the app. Saves are copied to the phone's own storage (Capacitor Preferences, `native/storage-native.js`) and restored at start-up if the web view loses its data. The test uses a stand-in for that plugin, so it still needs trying on a real device.
- Publishing needs an Apple Developer account and a Google Play developer account. Apple's review guidelines (4.2, minimum functionality) ask that an app offers more than a website in a frame; the offline play, saved games and touch layout help, but that is a decision for the review.

## Photos

Everything works without photos (neutral placeholders are shown). To add pictures, see **IMAGE-GUIDE.md** for every filename and a ready-to-use AI image prompt. Photos of rooms and staff can also be uploaded inside the game.

- `node tools/make-image-guide.js` regenerates IMAGE-GUIDE.md from the scenario data
- `node tools/check-assets.js` lists which pictures are present or missing
- `python3 tools/split-quad.py <grid image> <kind> <names> [--grid 6x4]` cuts a grid picture of any size (2x2 by default) into game pictures, finding the white lines between them automatically. It cuts four pictures (16:9 for scenes, 16:10 with `menu`, square 300 px headshots with `guests`), trimming the gutter and shrinking them to 1000 px wide. IMAGE-GUIDE.md's pictures can be generated four at a time this way.
- `python3 tools/optimise-images.py` shrinks pictures for the web (longest side 1000px for rooms and scenes, 1280px for the hotel, 300px for headshots; optimised progressive JPEG at quality 80). Run it on new pictures, then `node tools/make-sw.js`. Keep your full-size originals elsewhere; re-encoding an already optimised picture loses a little more each time.

## Adding scenarios

Scenarios live in `js/scenarios*.js` as plain objects (128 of them). Copy an existing one; the format is described at the top of `js/scenarios.js`. A scenario can be limited to some weather (`wx`) or seasons (`seasons`), as `js/scenarios-extra.js` shows. Rules:

- Keep at least one option that needs no staff and no money
- Never use gendered pronouns in text (use names, "the guest" or "they")
- Give each scenario an `imgPrompt` so it appears in the image guide

After editing run `node tests/simulate.js`. It checks every scenario's structure and plays every option of every scenario many times.

## Tests

| Command | What it checks |
|---|---|
| `node tests/simulate.js` | Rules engine: scenario structure, thousands of random days, every option of every scenario, state consistency, the small start, level-ups, build rules, reservations, the restaurant and menu, contractors (quotes, outcomes, defects, warranties, room downtime), unique names and surname rules, the day clock, shifts, rota and mood, managing bookings (changes, requests, moves, blocks, dinners), events (planning, sales, requests, settlement), the inbox and its actions, the bank lifeline, Reception booking, first steps, awards and tips, seasons, weather and pricing, challenges, the phone desk, the guest book and diary, ranks and the briefing, the player's bank and photo, goals and unlocks, the daily visit streak, the entertainment team, the four extras, and save migration |
| `node tests/ui.test.js [outDir]` | Real browser (Playwright): full playthrough, uploads, save and load, phone layout, screenshots |
| `node tests/pwa.test.js` | Install and offline: manifest and icons, service worker storing and updating, the game playing with no connection, the phone-app build and storage mirror, saves restored after the web view loses its data |
| `node tests/balance.js [games] [days]` | Difficulty and pacing: idle, attentive, careful and growing play styles, with the day each level is reached |

## Code layout

| File | Purpose |
|---|---|
| `js/data.js` | Constants and reference data (costs, roles, equipment, image paths) |
| `js/names-data.js`, `js/names.js` | Generated name lists, and the rules for unique people and family or couple surnames (no DOM access) |
| `js/scenarios*.js` | Scenario definitions (guests, business, the newer family, weather and town ones in `scenarios-extra.js`, and the extras' ones in `scenarios-fun.js`) |
| `js/engine.js` | Game rules and scenario engine (no DOM access) |
| `js/engine-extra.js` | Reservations, availability, restaurant dining and menu editing rules (no DOM access) |
| `js/engine-bookings.js` | Changing bookings, requests, room moves, blocks, dinner reservations, calendar (no DOM access) |
| `js/engine-events.js` | Events: planning, ticket sales, client requests, the night itself (no DOM access) |
| `js/engine-mail.js` | Inbox: live and stored messages, urgency, read marks, actions, handled log (no DOM access) |
| `js/engine-season.js` | Seasons, festivals, seeded weather and forecast, price-driven demand, pricing advice (no DOM access) |
| `js/engine-challenges.js` | Daily and weekly challenges, counters, rewards and streaks (no DOM access) |
| `js/engine-bank.js` | The player's made-up bank: name, colour and invented account number (no DOM access) |
| `js/engine-milestones.js` | Earnings goals, free unlocks of the extras, and the daily visit streak (no DOM access) |
| `js/engine-fun.js` | The arcade, Kids Club, shop and excursions: state, plans, ordering and the nightly takings (no DOM access) |
| `js/engine-phone.js` | The phone desk: callers, scripts, ringing, voicemail, scoring, answering, replies (no DOM access) |
| `js/engine-guestbook.js` | Guest notes, the guest book and returning guests, review replies and the diary (no DOM access) |
| `js/engine-career.js` | Career ranks and certificates, and the morning briefing (no DOM access) |
| `js/engine-mgmt.js` | Management online and offline, the held-back morning, and the real-clock catch-up (no DOM access) |
| `js/engine-wishes.js` | What guests asked for (sea view, ground floor, vegetarian food, a dish) and the complaints when it is not delivered (no DOM access) |
| `js/engine-coach.js` | First steps, awards, the day headline and tips (no DOM access) |
| `js/engine-team.js` | Shifts, the in-day clock, activity, mood, rota editing, hiring (no DOM access) |
| `js/engine-dashboard.js` | Dashboard figures: room status, equipment watch and the cash forecast (no DOM access) |
| `js/engine-contractors.js` | Contractor quotes, work orders, hidden outcomes, defects and warranties (no DOM access) |
| `js/ui.js` | Main screens, modals and event handling |
| `js/ui-dashboard.js`, `js/ui-team.js`, `js/ui-bookings.js`, `js/ui-events.js`, `js/ui-inbox.js` | The five panels |
| `js/ui-milestones.js`, `js/ui-fun.js`, `js/ui-phone.js` | The goal card, goals list and welcome-back screen; the Extras screen and its forms; the Phone tab, ringing button, call and message pop-ups and confirmation card; guest notes, the guest book, review replies and the Diary (`ui-guestbook.js`); the briefing card and certificates (`ui-career.js`) |
| `js/ui-mgmt.js`, `js/ui-setup.js` | The Management Online/Offline button, banner, locks and "While you were away"; the setup walkthrough |
| `js/ui-sound.js`, `js/ui-tour.js` | Sound effects, and the guided first day |
| `js/ui-menu.js`, `js/ui-contractors.js` | The menu builder (a tab of Events and Food), and the contractor quotes screen, work panel and directory |
| `js/storage.js`, `js/offline.js` | Save storage with an optional phone mirror, and offline set-up (service worker registration, picture storing) |
| `js/main.js` | Starts the game |
| `sw.js`, `pictures.json`, `manifest.webmanifest`, `icons/` | Service worker, picture list, install details and icons (the first two are generated by `tools/make-sw.js`) |
| `tools/make-sw.js`, `tools/make-icons.py`, `tools/apply-native-icons.py`, `tools/build-www.js`, `tools/optimise-images.py` | Rebuild the service worker list, the icons, the `www/` folder for the apps, and shrink pictures |
| `native/storage-native.js`, `capacitor.config.json`, `package.json` | Phone-app storage mirror and Capacitor set-up |
| `css/style.css` | Styling |
