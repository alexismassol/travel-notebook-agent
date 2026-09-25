import { useState } from "react";
import type { ChoiceBlock as ChoiceBlockData } from "../../shared/events";
import { CheckIcon } from "./icons";

export interface ChoiceAnswer {
  selected: string[];
  freeText?: string;
}

interface ChoiceBlockProps {
  block: ChoiceBlockData;
  answer?: ChoiceAnswer;
  disabled: boolean;
  onSubmit: (toolUseId: string, selected: string[], freeText: string | undefined) => void;
}

/**
 * Options en cartes cliquables. Une fois répondu (`answer` défini), le bloc est figé :
 * les cartes restent visibles mais ne sont plus interactives, le reste passe en opacité réduite.
 */
export function ChoiceBlock({ block, answer, disabled, onSubmit }: ChoiceBlockProps) {
  const [selected, setSelected] = useState<string[]>([]);

  const activeSelected = answer ? answer.selected : selected;
  const activeFreeText = answer?.freeText ?? "";
  const locked = answer !== undefined || disabled;

  const toggleOption = (label: string) => {
    if (locked) return;
    if (block.multiSelect) {
      setSelected((prev) =>
        prev.includes(label) ? prev.filter((item) => item !== label) : [...prev, label],
      );
    } else {
      setSelected([label]);
    }
  };

  const canSubmit = !locked && selected.length > 0;

  const handleSubmit = () => {
    if (!canSubmit) return;
    onSubmit(block.toolUseId, selected, undefined);
  };

  const optionButtons = block.options.map((option) => {
    const isSelected = activeSelected.includes(option.label);
    const isDimmed = answer !== undefined && !isSelected;
    const className = isSelected
      ? "choice-option choice-option--selected"
      : isDimmed
        ? "choice-option choice-option--dimmed"
        : "choice-option";
    const children = (
      <>
        {isSelected ? (
          <span className="choice-option__mark" aria-hidden="true">
            <CheckIcon />
          </span>
        ) : null}
        <span className="choice-option__label">{option.label}</span>
        {option.description ? (
          <span className="choice-option__description">{option.description}</span>
        ) : null}
      </>
    );
    // Rôle littéral par branche (checkbox/radio) : nécessaire pour que le linter d'accessibilité
    // valide `aria-checked` sur un rôle qu'il peut résoudre statiquement.
    return block.multiSelect ? (
      // biome-ignore lint/a11y/useSemanticElements: carte cliquable stylée, requise par la direction artistique, pas un <input> natif
      <button
        key={option.label}
        type="button"
        className={className}
        role="checkbox"
        aria-checked={isSelected}
        disabled={locked}
        onClick={() => toggleOption(option.label)}
      >
        {children}
      </button>
    ) : (
      // biome-ignore lint/a11y/useSemanticElements: carte cliquable stylée, requise par la direction artistique, pas un <input> natif
      <button
        key={option.label}
        type="button"
        className={className}
        role="radio"
        aria-checked={isSelected}
        disabled={locked}
        onClick={() => toggleOption(option.label)}
      >
        {children}
      </button>
    );
  });

  return (
    <div className="choice-block">
      <p className="choice-block__question">{block.question}</p>
      {block.multiSelect ? (
        <p className="choice-block__hint">Plusieurs réponses possibles</p>
      ) : null}
      {block.multiSelect ? (
        // biome-ignore lint/a11y/useSemanticElements: groupe de cartes, pas un <fieldset>, la mise en page en grille l'exige
        <div className="choice-block__options" role="group" aria-label={block.question}>
          {optionButtons}
        </div>
      ) : (
        <div className="choice-block__options" role="radiogroup" aria-label={block.question}>
          {optionButtons}
        </div>
      )}
      {/* Pas de champ libre ici : la zone d'écriture en bas de page fait déjà ce travail, et deux
          endroits pour écrire la même chose obligeaient à choisir lequel utiliser. */}
      {answer && activeFreeText ? (
        <p className="choice-block__freetext">« {activeFreeText} »</p>
      ) : null}
      {/* Une liste de choix sans issue de secours redevient un formulaire. Cette ligne dit au
          voyageur qu'il a le droit de ne pas savoir, et de demander à la place. */}
      {!answer ? (
        <p className="choice-block__ask">
          Vous hésitez ? Écrivez-moi votre question en bas, je vous aide à choisir.
        </p>
      ) : null}
      {!answer ? (
        <button
          type="button"
          className="choice-block__submit"
          disabled={!canSubmit}
          onClick={handleSubmit}
        >
          Valider
        </button>
      ) : null}
    </div>
  );
}
