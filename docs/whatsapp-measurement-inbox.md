# חיבור מדידות מוואטסאפ → AnyCloset

AnyCloset רץ על Vercel + Supabase בלבד (ללא שרת תמיד-דלוק), ולכן לא ניתן להריץ כאן `whatsapp-web.js`.  
הפתרון: גשר חיצוני (ברירת מחדל: [Green API](https://green-api.com)) ששולח webhook ל-Edge Function שלנו.

## ארכיטקטורה

1. שולח ספציפי שולח קובץ בוואטסאפ לחשבון שלך  
2. Green API מקבל את ההודעה ושולח JSON ל-`ingest-whatsapp-media`  
3. הפונקציה מורידה את הקובץ ל-Storage (`measurements`) ויוצרת שורה ב-`measurement_inbox`  
4. בדף הפרויקטים מופיע באדג׳ / באנר **"מדידות חדשות"**  
5. מקשרים ידנית את הקובץ לפרויקט/לקוח

## הגדרה ב-AnyCloset

1. היכנס ל־**הפרופיל שלי** → **חיבור מדידות מוואטסאפ**  
2. לחץ **צור / הצג טוקן**  
3. העתק את כתובת ה-Webhook (כוללת `?token=...`)

כתובת בסיס:

```
https://meqxnsjycvfgfhdepguo.supabase.co/functions/v1/ingest-whatsapp-media?token=YOUR_TOKEN
```

## הגדרה ב-Green API

1. צור Instance וסרוק QR עם חשבון הוואטסאפ שלך  
2. ב־Settings → Notifications / Webhooks:
   - **Incoming webhook URL** = הכתובת שהעתקת מ-AnyCloset  
   - הפעל קבלת הודעות נכנסות עם מדיה / `downloadUrl`  
3. מומלץ לסנן בצד Green API (או ב-Make) כך שרק מספר השולח הרצוי יועבר הלאה  
4. שמור ובדוק עם שליחת תמונה/PDF מהמספר המאושר

### אבטחה נוספת (אופציונלי)

אם מגדירים ב-Supabase Edge Function secret בשם `WHATSAPP_INGEST_SECRET`,  
יש לשלוח גם את הערך ב-header:

```
x-ingest-secret: <YOUR_SECRET>
```

בלי secret מוגדר — מספיק הטוקן הייחודי למשתמש (`?token=`).

## בדיקת End-to-End ללא וואטסאפ

אפשר לבדוק את הפונקציה ישירות:

```bash
curl -X POST \
  "https://meqxnsjycvfgfhdepguo.supabase.co/functions/v1/ingest-whatsapp-media?token=YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"file_url\": \"https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf\",
    \"file_name\": \"test-measurement.pdf\",
    \"mime_type\": \"application/pdf\",
    \"caption\": \"בדיקת מדידה\",
    \"source_phone\": \"972501234567\",
    \"sender_name\": \"בודק\",
    \"external_message_id\": \"test-001\"
  }"
```

אחרי תשובה `ok: true` — רענן את דף הפרויקטים; אמור להופיע באדג׳ ב־**מדידות חדשות**.

## קישור לפרויקט

1. פתח **מדידות חדשות**  
2. **קשר לפרויקט** → חפש לפי שם / לקוח / מספר הזמנה  
3. אופציונלי: עדכון סטטוס ל־**נשלחה מדידה** (ברירת מחדל מסומן)  
4. הקובץ נשמר גם ב־`project_attachments`

## הערות חשובות

- זה **לא** WhatsApp Business Cloud API רשמי של Meta — יש סיכון ניתוק סשן  
- הטוקן הוא סוד; אם דלף — לחץ **החלף טוקן** בפרופיל  
- קבצים ב-bucket פרטי `measurements`; הצפייה דרך signed URL  
- כפילויות מסוננות לפי `external_message_id` (מזהה ההודעה בגשר)
