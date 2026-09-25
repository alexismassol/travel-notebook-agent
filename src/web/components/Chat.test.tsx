// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { TimelineEntry } from "../lib/conversation";
import { Chat } from "./Chat";

/**
 * Une panne laisse le voyageur devant un mur. Il doit lire ce qui se passe, savoir si son projet
 * est perdu, et pouvoir repartir sans retaper son message quand un nouvel essai a une chance.
 */
afterEach(cleanup);

const filAvecErreur = (message: string, retry: boolean): TimelineEntry[] => [
  { type: "user", id: "u1", text: "bonjour" },
  { type: "agent", id: "a1", parts: [{ kind: "error", id: "e1", message, retry }] },
];

const rendre = (timeline: TimelineEntry[], onRetry = vi.fn()) => {
  render(
    <Chat
      timeline={timeline}
      choiceAnswers={{}}
      confirmStates={{}}
      sendErrors={{}}
      turnInFlight={false}
      onChoiceSubmit={() => {}}
      onBriefDecision={() => {}}
      contactEnvoye={null}
      onRestart={() => {}}
      onRetry={onRetry}
    />,
  );
  return onRetry;
};

describe("une panne pendant un tour", () => {
  it("le message est lu par les technologies d'assistance, et le projet est dit gardé", () => {
    rendre(filAvecErreur("Le service met plus de temps que prévu. Votre projet est gardé.", true));
    const alerte = screen.getByRole("alert");
    expect(alerte.textContent).toContain("Votre projet est gardé");
  });

  it("un nouvel essai possible donne un bouton qui rejoue le dernier message", () => {
    const onRetry = rendre(filAvecErreur("Réessayez dans un instant.", true));
    fireEvent.click(screen.getByRole("button", { name: /Réessayer/ }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("une panne durable ne propose pas de réessayer : ça ferait tourner en rond", () => {
    rendre(filAvecErreur("Le service est indisponible pour le moment.", false));
    expect(screen.queryByRole("button", { name: /Réessayer/ })).toBeNull();
  });
});

describe("reprise d'une conversation gardée", () => {
  /** Une page qui ne tient pas à l'écran, et qu'on regarde depuis le haut. */
  const pageLongueVueDuHaut = () => {
    Object.defineProperty(document.documentElement, "scrollHeight", {
      value: 3000,
      configurable: true,
    });
    Object.defineProperty(window, "innerHeight", { value: 800, configurable: true });
    window.scrollY = 0;
  };

  it("n'annonce rien non plus quand la reprise est rejouée, fil identique", () => {
    pageLongueVueDuHaut();
    const fil: TimelineEntry[] = [
      { type: "user", id: "u1", text: "On part au Vietnam" },
      { type: "agent", id: "a1", parts: [{ kind: "text", id: "t1", text: "Très bien." }] },
    ];
    const props = {
      choiceAnswers: {},
      confirmStates: {},
      sendErrors: {},
      turnInFlight: false,
      onChoiceSubmit: () => {},
      onBriefDecision: () => {},
      contactEnvoye: null,
      onRestart: () => {},
      onRetry: vi.fn(),
    };
    const { rerender } = render(<Chat timeline={fil} {...props} />);
    // L'ouverture d'une conversation gardée passe deux fois : le fil revient à l'identique,
    // dans un autre tableau. Rien n'est arrivé pour autant.
    rerender(<Chat timeline={[...fil]} {...props} />);
    expect(screen.queryByText(/Nouveau message/)).toBeNull();
  });

  it("n'annonce pas un « nouveau message » sur un fil qui arrive en entier", () => {
    pageLongueVueDuHaut();
    rendre([
      { type: "user", id: "u1", text: "On part au Vietnam" },
      { type: "agent", id: "a1", parts: [{ kind: "text", id: "t1", text: "Très bien." }] },
      { type: "user", id: "u2", text: "À deux, en novembre" },
    ]);
    expect(screen.queryByText(/Nouveau message/)).toBeNull();
  });
});

describe("pastille pendant un tour", () => {
  it("annonce la réponse qui arrive quand le lecteur est remonté", () => {
    Object.defineProperty(document.documentElement, "scrollHeight", {
      value: 3000,
      configurable: true,
    });
    Object.defineProperty(window, "innerHeight", { value: 800, configurable: true });
    // Le voyageur vient d'écrire : il est en bas de page.
    window.scrollY = 2200;
    const debut: TimelineEntry[] = [{ type: "user", id: "u1", text: "Racontez-moi" }];
    const props = {
      choiceAnswers: {},
      confirmStates: {},
      sendErrors: {},
      onChoiceSubmit: () => {},
      onBriefDecision: () => {},
      contactEnvoye: null,
      onRestart: () => {},
      onRetry: vi.fn(),
    };
    const { rerender } = render(<Chat timeline={debut} turnInFlight={true} {...props} />);
    expect(screen.queryByText(/Nouveau message/)).toBeNull();
    // Puis il remonte pour relire le début pendant que la réponse s'écrit.
    window.scrollY = 0;
    rerender(
      <Chat
        timeline={[
          ...debut,
          { type: "agent", id: "a1", parts: [{ kind: "text", id: "t1", text: "Voici." }] },
        ]}
        turnInFlight={true}
        {...props}
      />,
    );
    expect(screen.getByText(/Nouveau message/)).toBeTruthy();
  });
});
