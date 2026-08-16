import { t } from '../../i18n/index.js';
import { useSearchStore } from '../../stores/search-store.js';

/**
 * Las tres casillas del buscador: mayúsculas, palabra entera y regex.
 *
 * Los rótulos son los símbolos convencionales —`Aa`, `ab|`, `.*`— y no
 * palabras: es lo que espera cualquiera que haya usado otro editor, y el
 * `aria-label` de cada casilla lleva el nombre completo para quien no los vea.
 */
export function SearchOptions(): React.JSX.Element {
  const isRegex = useSearchStore((state) => state.isRegex);
  const isCaseSensitive = useSearchStore((state) => state.isCaseSensitive);
  const matchWholeWord = useSearchStore((state) => state.matchWholeWord);
  const toggleOption = useSearchStore((state) => state.toggleOption);

  const options = [
    { key: 'isCaseSensitive', label: t('search.caseSensitive'), checked: isCaseSensitive },
    { key: 'matchWholeWord', label: t('search.wholeWord'), checked: matchWholeWord },
    { key: 'isRegex', label: t('search.regex'), checked: isRegex },
  ] as const;

  return (
    <div className="search-panel__options">
      {options.map((option) => (
        <label key={option.key}>
          <input
            type="checkbox"
            checked={option.checked}
            onChange={() => {
              toggleOption(option.key);
            }}
          />
          {option.label}
        </label>
      ))}
    </div>
  );
}
