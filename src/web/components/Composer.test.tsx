// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Composer } from "./Composer";

/**
 * La zone de saisie porte deux règles que le voyageur découvre en tâtonnant : Entrée envoie,
 * Maj+Entrée va à la ligne. Et elle grandit avec le texte à mesure qu'il l'écrit.
 */
afterEach(cleanup);

describe("zone de saisie", () => {
  it("Entrée envoie le message, sans les espaces autour", () => {
    const onSend = vi.fn();
    render(<Composer disabled={false} placeholder="Écrivez votre message" onSend={onSend} />);
    const zone = screen.getByLabelText("Votre message");
    fireEvent.change(zone, { target: { value: "  Vietnam en novembre  " } });
    fireEvent.keyDown(zone, { key: "Enter" });
    expect(onSend).toHaveBeenCalledWith("Vietnam en novembre");
  });

  it("Maj+Entrée va à la ligne au lieu d'envoyer", () => {
    const onSend = vi.fn();
    render(<Composer disabled={false} placeholder="Écrivez votre message" onSend={onSend} />);
    const zone = screen.getByLabelText("Votre message");
    fireEvent.change(zone, { target: { value: "première ligne" } });
    fireEvent.keyDown(zone, { key: "Enter", shiftKey: true });
    expect(onSend).not.toHaveBeenCalled();
  });

  it("un message vide ne part pas, et le bouton reste désactivé", () => {
    const onSend = vi.fn();
    render(<Composer disabled={false} placeholder="Écrivez votre message" onSend={onSend} />);
    const zone = screen.getByLabelText("Votre message");
    fireEvent.change(zone, { target: { value: "   " } });
    fireEvent.keyDown(zone, { key: "Enter" });
    expect(onSend).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Envoyer")).toHaveProperty("disabled", true);
  });

  it("pendant un tour, on ne peut ni écrire ni envoyer", () => {
    const onSend = vi.fn();
    render(<Composer disabled={true} placeholder="Écrivez votre message" onSend={onSend} />);
    const zone = screen.getByLabelText("Votre message");
    expect(zone).toHaveProperty("disabled", true);
    fireEvent.keyDown(zone, { key: "Enter" });
    expect(onSend).not.toHaveBeenCalled();
  });

  it("la zone grandit avec le texte", () => {
    render(<Composer disabled={false} placeholder="Écrivez votre message" onSend={() => {}} />);
    const zone = screen.getByLabelText("Votre message") as HTMLTextAreaElement;
    // jsdom ne calcule pas de mise en page : on vérifie que la hauteur est bien pilotée par le
    // composant à partir du contenu, pas figée par un attribut `rows`.
    Object.defineProperty(zone, "scrollHeight", { value: 137, configurable: true });
    fireEvent.change(zone, { target: { value: "un paragraphe entier\nsur plusieurs lignes" } });
    expect(zone.style.height).toBe("137px");
  });
});
