# SP Future Tech – Product Catalogue (Cloudflare)

ही पहिली आवृत्ती customer login/cart/payment शिवाय Product Catalog आहे.

## यात काय आहे?
- Public catalogue: Products, category filter, search, product photos and prices.
- Hidden admin route: `/admin`
- Admin login, add/edit/delete products, add categories, active/inactive products.
- Cloudflare D1 stores product/category data.
- Product images are stored in Cloudflare D1 as BLOB data (keep each image under 1 MB).
- Cloudflare Worker provides the backend API and serves the React build.

## आवश्यक
- Node.js 20+
- Cloudflare account
- Wrangler CLI (project dependency मधून `npx wrangler` वापरता येईल)

## 1. Install
```bash
npm install
```

## 2. Cloudflare D1 database तयार करा
```bash
npx wrangler d1 create sp-future-tech-db
```
Command मधून मिळालेला `database_id` `wrangler.jsonc` मधील `PASTE_YOUR_D1_DATABASE_ID_HERE` च्या जागी टाका.

## 3. D1 tables तयार करा
```bash
npx wrangler d1 execute sp-future-tech-db --remote --file=./schema.sql
```

## 4. R2 bucket तयार करा
```bash
npx wrangler r2 bucket create sp-future-tech-images
```
`wrangler.jsonc` मधील bucket name `sp-future-tech-images` ठेवा.

## 5. Admin secrets सेट करा
तुमचे स्वतःचे Admin username आणि मजबूत password वापरा:
```bash
npx wrangler secret put ADMIN_USERNAME
npx wrangler secret put ADMIN_PASSWORD
npx wrangler secret put SESSION_SECRET
```
`SESSION_SECRET` साठी लांब random secret द्या (किमान 32 random characters; उदाहरणार्थ `openssl rand -hex 32` वापरून तयार करा). हे secrets code मध्ये किंवा GitHub मध्ये ठेवू नका.

## 5. Local preview
Cloudflare bindings शिवाय local preview पूर्ण चालणार नाही. आधी D1 local bindings वापरून तपासू शकता:
```bash
npm run dev
```
Vite preview मध्ये API calls साठी Worker चालत नाहीत; त्यामुळे अंतिम integration test `wrangler dev` ने करा:
```bash
npm run build
npx wrangler dev
```

## 6. Deploy
```bash
npm run deploy
```
Cloudflare dashboard मध्ये Worker चे deploy यशस्वी झाल्यावर दिलेल्या `workers.dev` URL वर तपासा.

## 7. Custom domain
Cloudflare Dashboard → Workers & Pages → तुमचा Worker → Settings / Domains & Routes मधून custom domain जोडा. Domain DNS Cloudflare मध्ये असल्यास सोपे जाते.

## महत्त्वाच्या सुरक्षा सूचना
- `/admin` लपवलेला URL आहे; तो स्वतः security नाही. API प्रत्येक admin operation आधी signed, HttpOnly, Secure, SameSite=Strict session cookie तपासतो.
- Admin username/password फक्त Cloudflare Secrets मध्ये ठेवा.
- हे starter implementation आहे. Public production launch आधी Cloudflare rate limiting/WAF, admin login rate limiting, backup policy, image moderation/size limits आणि error monitoring तपासा.
- Session 12 तासांनी expire होते.
- Product delete केल्यावर त्याचा D1 मधील image record सुद्धा delete केला जातो.
- एका category चे नाव बदलण्यासाठी पुढील आवृत्तीत category edit/delete सुविधा जोडता येईल.
- सध्या checkout, orders, payments, customer accounts आणि stock quantity नाहीत; कारण निवडलेली सुविधा फक्त catalogue आहे.

## Folder structure
```text
src/             React storefront + admin UI
worker/index.js  Cloudflare Worker backend
schema.sql       D1 database schema
wrangler.jsonc   Cloudflare bindings/config
```
