import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";

/**
 * Contrôle visuel sur l'application qui tourne (`npm run dev`) : mène une vraie conversation
 * (vrais appels à l'agent), puis capture le rendu en desktop et en mobile et vérifie ce qu'un
 * build ne voit pas : débordement horizontal, zones tactiles trop petites, images sans alt.
 *
 * Usage : npm run visual-check -- "premier message" "second message"
 * Captures : data/screenshots/<horodatage>/ (ignoré par git).
 */

const APP_URL = process.env.APP_URL ?? "http://localhost:5173";
const TURN_TIMEOUT_MS = 150_000;
const MIN_TAP_PX = 44;
const VIEWPORTS = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "mobile", width: 390, height: 844 },
] as const;

async function main() {
  const messages = process.argv.slice(2);
  if (messages.length === 0)
    messages.push("On veut du soleil en famille cet hiver, mais on sait pas où.");
  const outDir = new URL(
    `../data/screenshots/${new Date().toISOString().replace(/[:.]/g, "-")}/`,
    import.meta.url,
  );
  await mkdir(outDir, { recursive: true });

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: VIEWPORTS[0] });
  await page.goto(APP_URL, { waitUntil: "networkidle" });
  await page.screenshot({
    path: new URL("0-accueil-desktop.png", outDir).pathname,
    fullPage: true,
  });

  const shot = (name: string) =>
    page.screenshot({ path: new URL(`${name}.png`, outDir).pathname, fullPage: true });
  // Le champ reste ouvert pendant un tour : c'est le bouton « Arrêter » qui signale le tour
  // en cours. On attend qu'il apparaisse, puis qu'il disparaisse.
  const waitEndOfTurn = async () => {
    const stop = page.locator('[aria-label="Arrêter la réponse"]');
    await stop.waitFor({ state: "visible", timeout: 10_000 }).catch(() => {});
    await stop.waitFor({ state: "detached", timeout: TURN_TIMEOUT_MS });
    await page.waitForTimeout(800);
  };

  for (const [i, text] of messages.entries()) {
    const composer = page.locator("textarea");
    await composer.fill(text);
    await composer.press("Enter");
    await composer.waitFor({ state: "visible" });
    await waitEndOfTurn();
    await shot(`${i + 1}-tour-desktop`);
  }

  // Sans cet exercice, les captures ne montraient jamais une question à choix cliquée, le
  // téléchargement du carnet ni le panneau technique. On les exerce quand l'agent les propose.
  const openOption = page.locator(".choice-option:not([disabled])").first();
  if ((await openOption.count()) > 0) {
    await openOption.click();
    await page.getByRole("button", { name: "Valider" }).click();
    await waitEndOfTurn();
    await shot("choix-clique-desktop");
  }
  const telecharger = page.getByRole("button", { name: "Télécharger mon carnet de voyage" });
  if ((await telecharger.count()) > 0) {
    // Le PDF doit vraiment partir : on attend l'événement de téléchargement du navigateur, pas
    // seulement le message à l'écran.
    // Le prénom et l'adresse sont obligatoires : sans eux, le clic affiche « Indiquez votre
    // prénom. » et aucun téléchargement ne part (le script attendait alors 150 s pour rien).
    await page.getByLabel("Votre prénom").fill("Camille");
    await page.getByLabel("Votre adresse e-mail").fill("camille@exemple.fr");
    const pdf = page.waitForEvent("download", { timeout: TURN_TIMEOUT_MS });
    await telecharger.click();
    console.log(`carnet téléchargé : ${(await pdf).suggestedFilename()}`);
    await page.getByText("Votre carnet de voyage est téléchargé").first().waitFor();
    await page.waitForTimeout(800);
    await shot("carnet-telecharge-desktop");
  }
  await page.getByRole("button", { name: "Détails techniques" }).click();
  await page.waitForTimeout(300);
  await shot("details-techniques-desktop");
  // Le panneau se pose par-dessus la page : laissé ouvert, il intercepte les clics suivants,
  // à commencer par le bouton du carnet sur téléphone.
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);

  const conversations = page.getByRole("button", { name: "Mes conversations" });
  if ((await conversations.count()) > 0) {
    await conversations.click();
    await page.waitForTimeout(300);
    await shot("conversations-desktop");
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);
  }

  for (const viewport of VIEWPORTS) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.waitForTimeout(400);
    // Sur mobile le carnet est replié, donc ses préférences n'étaient jamais rendues ni
    // mesurées sans cette étape. On le déplie avant de capturer et de mesurer.
    const toggle = page.locator(".brief-panel__toggle");
    if ((await toggle.count()) > 0 && (await toggle.isVisible())) {
      const deplie = await page.locator(".brief-panel.is-expanded").count();
      if (deplie === 0) {
        await toggle.click();
        await page.waitForTimeout(400);
      }
    }
    await page.screenshot({
      path: new URL(`final-${viewport.name}.png`, outDir).pathname,
      fullPage: true,
    });
    const report = await page.evaluate((minTap) => {
      const overflow = document.documentElement.scrollWidth - document.documentElement.clientWidth;
      const smallTargets = [
        ...document.querySelectorAll("button, a, [role=button], input, textarea"),
      ]
        .map((el) => ({ el, r: el.getBoundingClientRect() }))
        .filter(({ r }) => r.width > 0 && (r.width < minTap || r.height < minTap))
        .map(
          ({ el, r }) =>
            `${el.tagName.toLowerCase()} "${(el.textContent ?? "").trim().slice(0, 30)}" ${Math.round(r.width)}x${Math.round(r.height)}`,
        );
      const imagesWithoutAlt = [...document.querySelectorAll("img")].filter(
        (img) => !img.getAttribute("alt"),
      ).length;
      return { overflow, smallTargets, imagesWithoutAlt };
    }, MIN_TAP_PX);
    console.log(viewport.name, JSON.stringify(report));
  }

  await browser.close();
  console.log(`captures : ${outDir.pathname}`);
}

void main();
