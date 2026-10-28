# F&F Chat (Friends & Family Chat)

Δωρεάν chat app για οικογένειες και παρέες: real-time μηνύματα, video updates, παιχνίδια, AI φίλος (ο κάθε χρήστης φέρνει το δικό του API key).
Cloudflare Workers + Durable Objects + D1 + R2, με React/Vite PWA frontend.

- Live: https://ff-chat.stoaops.com
- Worker: `wrangler.ff.toml` (`npm run ff:worker`), βάση: `npm run ff:db`
- Web: `npm run ff:web` (build με `.env.ff` και deploy στο Pages project `ff-chat`)

Ιστορικό: ξεκίνησε ως «Liakos Chat» (μονό chat) και έγινε κεντρική εφαρμογή όπου ο καθένας φτιάχνει τον δικό του χώρο.
Οι παλιοί οδηγοί `ODIGOS.md`/`BUILD_GUIDE.md` και τα `docs/` είναι ιστορικό υλικό.
