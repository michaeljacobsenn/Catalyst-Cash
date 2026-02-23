# How to Deploy Catalyst Cash Website on Cloudflare Pages

1. **Log in to Cloudflare**
   Go to [dash.cloudflare.com](https://dash.cloudflare.com) and log into your account.

2. **Navigate to Pages**
   On the left sidebar, click on **Workers & Pages**, then click the **Create application** button. Select the **Pages** tab.

3. **Upload the Website Directory**
   - Under the "Upload assets" section, click **Upload assets**.
   - Create a project name (like `portfolio-pro-website`).
   - Drag and drop the **`website`** folder that was just created on your desktop inside the `CatalystCash Public` project directly into the upload area on Cloudflare.
   - Click **Deploy site**.

4. **Connect Your Custom Domain**
   Once deployed, click on the **Custom Domains** tab in your Pages project.
   - Click **Set up a custom domain**.
   - Enter your domain `portfolioproapp.app` and click **Continue**.
   - Cloudflare will automatically configure the DNS records since your domain is purchased through them.
   - Click **Activate domain**.

5. **Done!**
   Your website is now live! It will serve `index.html` at the root, and the `/privacy` and `/terms` paths will work seamlessly. The app is already configured to point to these new URLs.
