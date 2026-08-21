import { useEffect, useRef, useState } from 'react';

import { t } from '../i18n/index.js';

import { MENU_REGISTRY } from './menu-registry.js';
import { Menu } from './Menu.js';

/**
 * La barra de menús de la barra de título.
 *
 * Existe desde [ADR-0030](../../../../../docs/adr/0030-barra-de-titulo-propia.md):
 * es la superficie que hace **descubrible** lo que hasta ahora sólo vivía en la
 * paleta de comandos. La paleta sirve para quien sabe qué buscar; un menú
 * sirve para quien no.
 *
 * Navegación completa por teclado (RNF-23): `Alt` enfoca la barra, las flechas
 * horizontales cambian de menú, las verticales recorren los ítems, `Escape`
 * cierra y devuelve el foco al título del menú.
 *
 * `role="menubar"` de verdad, no una fila de botones: es el patrón que un
 * lector de pantalla espera, y a diferencia del rail de actividades acá no hay
 * ningún tablist con el que confundirse.
 */
export function MenuBar(): React.JSX.Element {
  const [openId, setOpenId] = useState<string | null>(null);
  const barRef = useRef<HTMLDivElement | null>(null);

  useAltFocus(barRef);

  const close = (): void => {
    setOpenId(null);
  };

  return (
    <div
      ref={barRef}
      role="menubar"
      aria-label={t('menu.bar')}
      className="menu-bar"
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          close();
          focusTrigger(barRef.current, openId);
          return;
        }

        moveBetweenMenus(event, openId, setOpenId);
      }}
      // El menú se cierra al perder el foco, no con un listener global de
      // click: un `mousedown` en el documento también dispara con el click que
      // abre el menú, y el orden entre los dos depende del navegador.
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) close();
      }}
    >
      {MENU_REGISTRY.map((menu) => (
        <div key={menu.id} className="menu-bar__slot">
          <button
            type="button"
            role="menuitem"
            aria-haspopup="menu"
            aria-expanded={openId === menu.id}
            className="menu-bar__trigger"
            data-menu={menu.id}
            data-testid={`menu-trigger-${menu.id}`}
            onClick={() => {
              setOpenId(openId === menu.id ? null : menu.id);
            }}
            // Con un menú ya abierto, pasar el mouse por otro título lo abre
            // sin clickear. Es lo que hace cualquier barra de menús y lo que
            // vuelve insoportable una que no lo hace.
            onMouseEnter={() => {
              if (openId !== null) setOpenId(menu.id);
            }}
          >
            {t(menu.labelKey)}
          </button>

          {openId === menu.id && <Menu menu={menu} onClose={close} />}
        </div>
      ))}
    </div>
  );
}

/**
 * `Alt` a secas enfoca el primer título de la barra.
 *
 * Es la convención de Windows y la única forma de llegar a los menús sin
 * mouse cuando el foco está adentro del editor. Se ignora si viene acompañado
 * de otra tecla: `Alt+Tab` y compañía no son nuestros.
 */
function useAltFocus(barRef: React.RefObject<HTMLDivElement | null>): void {
  useEffect(() => {
    const onKeyUp = (event: KeyboardEvent): void => {
      if (event.key !== 'Alt' || event.ctrlKey || event.shiftKey || event.metaKey) return;

      event.preventDefault();
      barRef.current?.querySelector('button')?.focus();
    };

    document.addEventListener('keyup', onKeyUp);

    return () => {
      document.removeEventListener('keyup', onKeyUp);
    };
  }, [barRef]);
}

/** Devuelve el foco al título del menú que se acaba de cerrar. */
function focusTrigger(bar: HTMLDivElement | null, openId: string | null): void {
  if (bar === null || openId === null) return;

  focusMenuTrigger(bar, openId);
}

/**
 * Las flechas horizontales cambian de menú, dando la vuelta en los extremos.
 *
 * Con un menú abierto además lo cambia por el de al lado, que es lo que hace
 * cualquier barra de menús: recorrer los siete sin cerrar y volver a abrir.
 */
function moveBetweenMenus(
  event: React.KeyboardEvent<HTMLDivElement>,
  openId: string | null,
  setOpenId: (id: string | null) => void
): void {
  if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;

  event.preventDefault();

  const ids = MENU_REGISTRY.map((menu) => menu.id);
  const current = ids.indexOf(openId ?? focusedMenuId());
  const step = event.key === 'ArrowRight' ? 1 : -1;
  const next = ids[(current + step + ids.length) % ids.length] ?? '';

  // Con un menú abierto se cambia el abierto; con el foco en la barra pero sin
  // desplegar, se mueve el foco. Son las dos formas de recorrer una barra de
  // menús y las dos tienen que andar.
  if (openId !== null) setOpenId(next);
  else focusMenuTrigger(event.currentTarget, next);
}

/** El id del menú cuyo título tiene el foco, o `''` si el foco está en otro lado. */
function focusedMenuId(): string {
  const focused = document.activeElement;

  return focused instanceof HTMLElement ? (focused.dataset.menu ?? '') : '';
}

/** Enfoca el título de un menú por su id. */
function focusMenuTrigger(bar: HTMLDivElement, id: string): void {
  bar.querySelector<HTMLButtonElement>(`button[data-menu="${id}"]`)?.focus();
}
