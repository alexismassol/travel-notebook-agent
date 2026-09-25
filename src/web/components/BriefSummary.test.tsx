// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { emptyBrief } from "../../shared/brief";
import type { BriefSummaryBlock } from "../../shared/events";
import { BriefSummary } from "./BriefSummary";

const telecharger = vi.fn();
vi.mock("../lib/carnetPdf", () => ({
  downloadCarnet: (...args: unknown[]) => telecharger(...args),
}));

/** Dernier écran : il montre le carnet, le fait télécharger, et laisse encore modifier. */
afterEach(cleanup);
beforeEach(() => telecharger.mockClear());

const bloc: BriefSummaryBlock = {
  kind: "brief_summary",
  toolUseId: "toolu_envoi",
  message: "Vous partez 3 semaines au Vietnam en novembre, à deux.",
  brief: (() => {
    const b = emptyBrief();
    b.version = 3;
    b.mandatory.destination = {
      status: "confirmed",
      value: { mode: "fixed", places: ["Vietnam"], zone: "Vietnam", criteria: [] },
      alternatives: [],
      evidence: [],
    };
    return b;
  })(),
  completeness: { ready: true, mandatoryOk: 4, missing: [] },
};

const rendre = (props: Partial<Parameters<typeof BriefSummary>[0]> = {}) => {
  const onDecision = vi.fn();
  const onRestart = vi.fn();
  render(
    <BriefSummary
      block={bloc}
      disabled={false}
      onDecision={onDecision}
      onRestart={onRestart}
      {...props}
    />,
  );
  return { onDecision, onRestart };
};

const BOUTON = "Télécharger mon carnet de voyage";
const contact = { firstName: "Camille", email: "camille@exemple.fr" };

describe("récapitulatif avant validation", () => {
  it("montre le carnet et propose les deux issues", () => {
    rendre();
    expect(screen.getByText("Votre carnet de voyage est prêt")).toBeTruthy();
    expect(screen.getByText(/3 semaines au Vietnam/)).toBeTruthy();
    expect(screen.getByRole("button", { name: BOUTON })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Modifier quelque chose" })).toBeTruthy();
  });

  it("le clic sur télécharger remonte la décision, sans rien télécharger avant le serveur", () => {
    const { onDecision } = rendre();
    fireEvent.change(screen.getByLabelText("Votre prénom"), { target: { value: "Alexis" } });
    fireEvent.change(screen.getByLabelText("Votre adresse e-mail"), {
      target: { value: "alexis@pm.me" },
    });
    fireEvent.click(screen.getByRole("button", { name: BOUTON }));
    expect(onDecision).toHaveBeenCalledWith("toolu_envoi", "send", {
      firstName: "Alexis",
      email: "alexis@pm.me",
    });
    expect(telecharger).not.toHaveBeenCalled();
  });

  it("une fois le carnet validé, on peut préparer un autre voyage", () => {
    const { onRestart } = rendre({ state: "sent" });
    expect(screen.getByText(/Votre carnet de voyage est téléchargé/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Préparer un autre voyage" }));
    expect(onRestart).toHaveBeenCalled();
  });

  it("un échec est annoncé, et le carnet n'est pas dit téléchargé", () => {
    rendre({ sendError: "Le carnet n'a pas pu être préparé. Réessayez dans un instant." });
    expect(screen.getByRole("alert").textContent).toContain("n'a pas pu être préparé");
    expect(screen.queryByText(/est téléchargé/)).toBeNull();
  });
});

describe("le carnet à emporter", () => {
  const rendreAvecEtat = (state: "pending" | "sent" | undefined) => {
    const props = { block: bloc, disabled: false, onDecision: vi.fn(), onRestart: vi.fn() };
    return render(<BriefSummary {...props} state={state} contactEnvoye={contact} />);
  };

  it("se télécharge tout seul, une fois, dès que le serveur l'a validé", () => {
    const { rerender } = rendreAvecEtat("pending");
    const props = { block: bloc, disabled: false, onDecision: vi.fn(), onRestart: vi.fn() };
    rerender(<BriefSummary {...props} state="sent" contactEnvoye={contact} />);
    rerender(<BriefSummary {...props} state="sent" contactEnvoye={contact} />);
    expect(telecharger).toHaveBeenCalledTimes(1);
    expect(telecharger).toHaveBeenCalledWith(bloc.brief, bloc.completeness, contact);
  });

  it("tant que le serveur n'a pas validé, rien ne se télécharge", () => {
    rendreAvecEtat("pending");
    expect(screen.getByRole("button", { name: "Préparation de votre carnet…" })).toBeTruthy();
    expect(telecharger).not.toHaveBeenCalled();
  });

  it("un carnet déjà validé, rouvert après un rechargement, ne se retélécharge pas seul", () => {
    rendreAvecEtat("sent");
    expect(telecharger).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Télécharger à nouveau" })).toBeTruthy();
  });
});

describe("contact avant le téléchargement", () => {
  it("ne laisse pas valider un carnet sans adresse e-mail valable", () => {
    const { onDecision } = rendre();
    fireEvent.change(screen.getByLabelText("Votre prénom"), { target: { value: "Alexis" } });
    fireEvent.change(screen.getByLabelText("Votre adresse e-mail"), {
      target: { value: "alexis.pm.me" },
    });
    fireEvent.click(screen.getByRole("button", { name: BOUTON }));
    expect(onDecision).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toContain("adresse e-mail");
  });

  it("transmet le prénom et l'adresse, sans espaces ni majuscules parasites", () => {
    const { onDecision } = rendre();
    fireEvent.change(screen.getByLabelText("Votre prénom"), { target: { value: " Alexis " } });
    fireEvent.change(screen.getByLabelText("Votre adresse e-mail"), {
      target: { value: "Alexis@PM.ME" },
    });
    fireEvent.click(screen.getByRole("button", { name: BOUTON }));
    expect(onDecision).toHaveBeenCalledWith("toolu_envoi", "send", {
      firstName: "Alexis",
      email: "alexis@pm.me",
    });
  });

  it("dit à quoi servent le prénom et l'adresse, là où on les demande", () => {
    rendre();
    expect(screen.getByText(/s'impriment en haut du carnet/i)).toBeTruthy();
  });
});

describe("carnet retéléchargé après coup", () => {
  it("porte le contact même quand la page a été rechargée entre-temps", () => {
    rendre({ state: "sent", contactEnvoye: contact });
    fireEvent.click(screen.getByRole("button", { name: "Télécharger à nouveau" }));
    expect(telecharger).toHaveBeenCalledWith(bloc.brief, bloc.completeness, contact);
  });
});
