# WhatsApp setup

InterNyay sends hearing and payment reminders to clients through the Meta WhatsApp Cloud API, using two approved message templates. Nothing is sent until the three values below are set and both templates are approved.

## 1. Meta account

1. Create a Meta Business account at business.facebook.com and verify the business.
2. At developers.facebook.com create an app of type Business and add the WhatsApp product.
3. Under WhatsApp > API Setup, add the phone number the reminders will be sent from. Meta gives a test number first; it can only message up to five recipients you verify, so use your own number to try it.
4. Copy the Phone number ID from the same page (not the phone number itself).

## 2. Permanent token

The token on the API Setup page expires in about 24 hours. For a server use a permanent one:

1. Business Settings > Users > System users > add a system user with the Admin role.
2. Assign the app and the WhatsApp account to it with full control.
3. Generate a token for that user with the permissions `whatsapp_business_messaging` and `whatsapp_business_management`, and choose no expiry.

## 3. Message templates

In WhatsApp Manager > Message templates create both templates with category Utility and language English (`en`). The names must match exactly. Use body text only, with no header, footer or buttons. The numbered values are filled in by InterNyay in this order.

`internyay_hearing_reminder` has 6 values: 1 client name, 2 case title, 3 case number, 4 hearing date, 5 court and court number, 6 advocate name.

```
Hello {{1}}, this is a reminder from your advocate about the case {{2}}, Case No. {{3}}. The next hearing is on {{4}} at {{5}}. Please be available as advised. For any query reply to this message or call your advocate, {{6}}. Thank you.
```

`internyay_payment_due` has 5 values: 1 client name, 2 case title, 3 case number, 4 amount due (for example `Rs. 15,000`), 5 advocate name.

```
Hello {{1}}, this is a gentle reminder from your advocate about the pending fee for the case {{2}}, Case No. {{3}}. The amount due is {{4}}. Please contact {{5}} for payment details. Thank you.
```

Do not start or end the body with a value (a full stop after the last value does not count as text, so end with words such as "Thank you."), and keep the count and order of values as above, otherwise Meta rejects the template or the send fails. If you change a template name or language, change `whatsapp.template.hearing-reminder`, `whatsapp.template.payment-due` or `whatsapp.template.language` in `application.properties` to match. Approval usually takes a few minutes to a day.

## 4. Server settings

Set these in `.env` and restart the backend:

```
WHATSAPP_PHONE_NUMBER_ID=<phone number id>
WHATSAPP_TOKEN=<permanent token>
WHATSAPP_DRY_RUN=true
```

Keep `WHATSAPP_DRY_RUN=true` for the first run. Messages are then only written to the log as `WhatsApp DRY RUN`, so you can check the numbers and values without sending anything.

A client's WhatsApp number is optional. A client without one is skipped by the automatic reminders; when someone sends a hearing or payment reminder by hand from the app and nobody on the case has a number, the app asks them to add it (it opens the client's edit form). Client numbers with 10 digits get the country code `91` added. Change `whatsapp.default-country-code` for another country.

## 5. Go live

1. Wait until both templates show Approved.
2. Set `WHATSAPP_DRY_RUN=false` and restart.
3. Open a case whose client has your own WhatsApp number and send a hearing reminder and a payment reminder from the case page.
4. Automatic reminders run every day at 10 AM India time (`whatsapp.reminder.cron`) for cases where they are switched on.

## Errors

- `WhatsApp is not set up on the server yet`: the token or the phone number id is empty.
- `is not a valid WhatsApp number`: the client's number is not 10 to 15 digits.
- `Template name does not exist in the translation`: the template is not approved yet, or its name or language differs from the settings.
- `Number of parameters does not match`: the template body has a different count of values than listed above.
- `Recipient phone number not in allowed list`: you are on the test number and the client's number is not one of the verified recipients.
- `Error validating access token`: the token expired or lacks the two permissions.
