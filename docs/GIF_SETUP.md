# GIF search setup

GIF search goes through the server routes `GET /api/gifs/search?q=&limit=&cursor=&locale=` and
`GET /api/gifs/trending?limit=&cursor=&locale=`. They proxy **GIPHY** (preferred) or **Tenor v2**.
The provider key is read only from a server env var and is never returned, logged or exposed to the browser.

| Env var | Provider | Notes |
|---|---|---|
| `GIPHY_API_KEY` | GIPHY (`api.giphy.com/v1/gifs`) | Used if set. Rating `pg-13`. UI shows "Powered by GIPHY". |
| `TENOR_API_KEY` | Tenor v2 (`tenor.googleapis.com/v2`) | Fallback if no GIPHY key. `contentfilter=medium`. |

Never use a `NEXT_PUBLIC_` prefix for these keys.

Without a key the routes return `503 {"code":"gif_not_configured"}` and the picker says GIF search is not
connected yet. People can still upload a `.gif` from their device (up to 1 MB, stored only on the device) or paste a direct GIPHY/Tenor link.

Responses only include media on `media.giphy.com`, `media0-9.giphy.com`, `i.giphy.com`, `media.tenor.com` and `media0-9.tenor.com`.
Results are cached publicly (`trending`: 5 min browser / 15 min CDN, `search`: 2 / 5 min), and upstream requests time out after 5 s.

---

## Кратко для владельца (RU)

**Что нужно сделать, чтобы заработал поиск GIF:**

1. Зайдите на <https://developers.giphy.com/dashboard/> и войдите (или зарегистрируйтесь, это бесплатно).
2. Нажмите **Create an App**, выберите **API** (не SDK), укажите название (например, `INTENT`) и короткое описание.
3. Скопируйте выданный **API Key**. Бесплатный ключ (beta) даёт ограниченное число запросов в час, и этого хватает для превью.
   Для продакшена GIPHY попросит подать заявку на production key через ту же панель.
4. В Vercel откройте проект, затем **Settings → Environment Variables → Add**:
   - Key: `GIPHY_API_KEY`
   - Value: ваш ключ
   - Environments: отметьте **только Preview** (в Production пока не нужно)
   - Ключ **без** префикса `NEXT_PUBLIC_`, иначе он попадёт в браузер.
5. Сделайте Redeploy последнего Preview-деплоя, потому что переменные применяются только к новым сборкам.
6. Проверьте адрес `https://<ваш-preview>.vercel.app/api/gifs/trending`. Должен прийти JSON со списком `results`.
   Если пришло `gif_not_configured`, значит ключ не подхватился (проверьте окружение и сделайте redeploy).

Ключ нельзя вставлять в код, чат или коммиты, только в настройки Vercel.
Надпись «Powered by GIPHY» в пикере обязательна по правилам GIPHY, её нельзя убирать.
Пока ключа нет, в чате можно отправить свой .gif с устройства или вставить прямую ссылку GIPHY/Tenor.
