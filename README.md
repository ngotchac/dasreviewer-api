#DasReviewer RestApi

DasReviewer Api is a NodeJS application, used mainly by DasReviewer, in order to get all the necessary data from RedMine on preivous revisions.

It also manages the comments, ie. adding a new line to a specified Google SpreadSheet.

## Google SpreadSheet

In order to add a comment, the following steps need to be followed (from [google-oauth-jwt](https://github.com/extrabacon/google-oauth-jwt#creating-a-service-account-using-the-google-developers-console)):

1. From the [Google Developers Console](https://cloud.google.com/console), select your project or create a new one.

2. Under "APIs & auth", click "Credentials".

3. Under "OAuth", click the "Create new client ID" button.

4. Select "Service account" as the application type and click "Create Client ID".

5. The key for your new service account should prompt for download automatically. Note that your key is protected with a password.
   IMPORTANT: keep a secure copy of the key, as Google keeps only the public key.

6. Convert the downloaded key to PEM, so we can use it from the Node [crypto](http://nodejs.org/api/crypto.html) module.

   To do this, run the following in Terminal:
   ```bash
   openssl pkcs12 -in downloaded-key-file.p12 -out certificate.pem -nodes
   ```

   You will be asked for the password you received during step 5.

7. Move `certificate.pem` to `./app/` .

8. Modify `./app/config.js` email string to match the generated one in "APIs & auth" > "Credentials" > "EMAIL ADDRESS".

9. Share the Google SpreadSheet with the previous "EMAIL ADDRESS"

## NodeJS

Install all the dependencies:
```bash
npm install
```

If you get an error, try this before:
```bash
sudo apt-get install build-essential
```

You can now run the server:
```bash
node app/app.js
```
