# PZ Editor: static website

Plain static files with no build step and no server code. Upload the whole folder to any static host.

## Put it on your own domain (e.g. www.pz-editor.com)

1. Buy the domain from any registrar (Namecheap, Cloudflare, Porkbun, ROTLD for .ro, ...).
2. Host the folder. Any of these is free:
   - **GitHub Pages**: create a repo, upload these files to the root, then go to Settings → Pages → Deploy from branch `main` / root.
     Under "Custom domain", enter `www.pz-editor.com`. This creates a `CNAME` file.
   - **Cloudflare Pages / Netlify**: drag and drop this folder in their dashboard, then add the custom domain.
3. DNS at your registrar:
   - `www` → CNAME → `<your-user>.github.io` (or the Netlify/Cloudflare target they show you)
   - apex `pz-editor.com` → the A records your host lists (GitHub: 185.199.108.153, .109.153, .110.153, .111.153)
4. Turn on "Enforce HTTPS" once the certificate is issued (usually within an hour).

## Files
- index.html: home page
- recipes.html: recipe editor (40 recipe files, 606 recipes)
- clothing, container, drainable, food, key, literature, normal, weapon, weaponpart .html: item editors

Each editor embeds its script data, so the site works offline. Unsaved edits are stored in the visitor's own browser (localStorage).
