# OMS Pärnu Android

Mobiilirakenduse prototüüp hooldustaotluste loomiseks. Osakond määrab protsesside loendi. Kõik väljad peale foto on kohustuslikud. Taotlused ja fotod salvestatakse kohalikult telefoni rakenduse andmetesse. Rakendus ei saada taotlusi algsesse OMS-i.

## Käivitamine

```bash
npm install
npx expo install --check
npm start
```

Ava QR-kood Androidi **Expo Go** rakenduses. APK ehitamiseks logi oma Expo kontoga sisse ja käivita `npx eas-cli@latest build --platform android --profile preview`. `eas.json` määrab paigaldatava APK vormingu. Ehitus ei ole veel käivitatud.

## Väljad

- **Osakond:** Spoonitöötlus, Järeltöötlus, Üldine.
- **Protsess:** Spoonitöötlus → Jätkuliin, Vahespoon1, Vahespoon3, Pinnaspoon, Käsiladumine; Järeltöötlus → Lihvimisliin, Pahteldusliin, Formaatsaag Raute; Üldine → Üldine.
- **Pealkiri, Kirjeldus, Nimi** on kohustuslikud tekstiväljad. Nimi algväärtus on Slepko Aleksander.
- **Lisa pilt:** kaamera või galerii, valikuline.
- **Teate kategooria:** teadaolev OMS-i väärtus `Notification | M1 - Maintenance Request`. Muud valikud vajavad kinnitatud OMS-i loendit.
- **Prioriteet:** 1 - Väga kõrge, 2 - Kõrge, 3 - Keskmine, 4 - Madal; algväärtus 3 - Keskmine.

Andmed kaovad rakenduse andmete kustutamisel või eemaldamisel. Selle versiooni andmed on ainult selles seadmes.
