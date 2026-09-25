import { useState } from "react";
import type { CardsBlock } from "../../shared/events";
import { Contours } from "./Contours";
import { AlertIcon, CalendarIcon, SunIcon, TravellersIcon } from "./icons";

interface DestinationCardsProps {
  block: CardsBlock;
}

function buildMapUrl(coordinates: { lat: number; lon: number }): string {
  const { lat, lon } = coordinates;
  const bbox = `${lon - 0.5},${lat - 0.5},${lon + 0.5},${lat + 0.5}`;
  return `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${lat},${lon}`;
}

/** 1 à 3 fiches destination. Photo et coordonnées viennent du serveur, jamais écrites par le modèle. */
export function DestinationCards({ block }: DestinationCardsProps) {
  const [openMaps, setOpenMaps] = useState<Record<string, boolean>>({});

  const toggleMap = (key: string) => {
    setOpenMaps((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const isSingle = block.cards.length === 1;

  return (
    <div className={isSingle ? "destination-cards destination-cards--single" : "destination-cards"}>
      {block.cards.map((card) => {
        const key = `${card.name}-${card.country}`;
        const isMapOpen = Boolean(openMaps[key]);
        return (
          <article className="destination-card" key={key}>
            <div className="destination-card__media">
              {card.imageUrl ? (
                <img
                  src={card.imageUrl}
                  // biome-ignore lint/a11y/noRedundantAlt: format imposé par la direction artistique ("Photo : {nom}")
                  alt={`Photo : ${card.name}`}
                  loading="lazy"
                  decoding="async"
                  className={
                    // Carte Wikipédia rendue en image : on la montre entière plutôt que de la couper.
                    card.imageUrl.includes(".svg")
                      ? "destination-card__media-img destination-card__media-img--contain"
                      : "destination-card__media-img"
                  }
                />
              ) : (
                <div className="destination-card__placeholder">
                  <Contours />
                  <span>{card.name}</span>
                </div>
              )}
            </div>
            <div className="destination-card__body">
              <h3 className="destination-card__name">{card.name}</h3>
              <p className="destination-card__country">{card.country}</p>
              <p className="destination-card__summary">{card.summary}</p>
              <dl className="destination-card__facts">
                <div className="destination-card__fact">
                  <SunIcon className="destination-card__fact-icon" />
                  <div>
                    <dt>Pourquoi ici</dt>
                    <dd>{card.whyHere}</dd>
                  </div>
                </div>
                <div className="destination-card__fact">
                  <CalendarIcon className="destination-card__fact-icon" />
                  <div>
                    <dt>Quand partir</dt>
                    <dd>{card.whenToGo}</dd>
                  </div>
                </div>
                <div className="destination-card__fact">
                  <TravellersIcon className="destination-card__fact-icon" />
                  <div>
                    <dt>Pour vous</dt>
                    <dd>{card.forThisProfile}</dd>
                  </div>
                </div>
              </dl>
              {card.watchOut ? (
                <p className="destination-card__watchout">
                  <AlertIcon className="destination-card__watchout-icon" />
                  <span>{card.watchOut}</span>
                </p>
              ) : null}
              <div className="destination-card__links">
                {card.coordinates ? (
                  <button
                    type="button"
                    className="link-button"
                    aria-expanded={isMapOpen}
                    onClick={() => toggleMap(key)}
                  >
                    {isMapOpen ? "Masquer la carte" : "Voir sur la carte"}
                  </button>
                ) : null}
                {card.pageUrl ? (
                  <a href={card.pageUrl} target="_blank" rel="noreferrer">
                    Wikipédia
                  </a>
                ) : null}
              </div>
              {isMapOpen && card.coordinates ? (
                <iframe
                  className="destination-card__map"
                  title={`Carte de ${card.name}`}
                  loading="lazy"
                  src={buildMapUrl(card.coordinates)}
                />
              ) : null}
            </div>
          </article>
        );
      })}
    </div>
  );
}
