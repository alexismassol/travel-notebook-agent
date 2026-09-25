// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ChoiceBlock as ChoiceBlockData } from "../../shared/events";
import { ChoiceBlock } from "./ChoiceBlock";

/** Une question à choix est le moment où le voyageur décide : elle ne doit jamais partir à vide. */
afterEach(cleanup);

const question: ChoiceBlockData = {
  kind: "choice",
  toolUseId: "toolu_1",
  question: "Combien de personnes partent ?",
  options: [{ label: "2 adultes", description: "un couple" }, { label: "2 adultes et 2 enfants" }],
  multiSelect: false,
  allowFreeText: true,
};

describe("question à choix", () => {
  it("rien ne part tant qu'aucune option n'est choisie", () => {
    const onSubmit = vi.fn();
    render(<ChoiceBlock block={question} disabled={false} onSubmit={onSubmit} />);
    expect(screen.getByText("Combien de personnes partent ?")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Valider/ }));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("l'option cliquée est renvoyée telle quelle, avec son identifiant d'appel", () => {
    const onSubmit = vi.fn();
    render(<ChoiceBlock block={question} disabled={false} onSubmit={onSubmit} />);
    fireEvent.click(screen.getByText("2 adultes et 2 enfants"));
    fireEvent.click(screen.getByRole("button", { name: /Valider/ }));
    expect(onSubmit).toHaveBeenCalledWith("toolu_1", ["2 adultes et 2 enfants"], undefined);
  });

  it("une réponse déjà donnée fige le bloc : on ne peut pas répondre deux fois", () => {
    const onSubmit = vi.fn();
    render(
      <ChoiceBlock
        block={question}
        answer={{ selected: ["2 adultes"] }}
        disabled={false}
        onSubmit={onSubmit}
      />,
    );
    fireEvent.click(screen.getByText("2 adultes et 2 enfants"));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("pendant un tour, les options ne répondent pas", () => {
    const onSubmit = vi.fn();
    render(<ChoiceBlock block={question} disabled={true} onSubmit={onSubmit} />);
    fireEvent.click(screen.getByText("2 adultes"));
    fireEvent.click(screen.getByRole("button", { name: /Valider/ }));
    expect(onSubmit).not.toHaveBeenCalled();
  });
});

describe("le voyageur qui ne sait pas quoi répondre", () => {
  it("le bloc invite à poser une question plutôt qu'à choisir", () => {
    render(<ChoiceBlock block={question} disabled={false} onSubmit={() => {}} />);
    expect(screen.getByText(/écrivez-moi votre question en bas/i)).toBeTruthy();
    // Un seul endroit où écrire : la zone d'écriture de la page, pas un champ dans le bloc.
    expect(screen.queryByPlaceholderText(/autre réponse/i)).toBeNull();
  });

  it("une fois répondu, l'invitation disparaît", () => {
    render(
      <ChoiceBlock
        block={question}
        answer={{ selected: ["2 adultes"] }}
        disabled={false}
        onSubmit={() => {}}
      />,
    );
    expect(screen.queryByText(/écrivez-moi votre question/i)).toBeNull();
  });
});
