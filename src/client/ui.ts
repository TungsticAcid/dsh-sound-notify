/**
 * Composer-dock control and settings panel for the sound-notify plugin.
 *
 * The button opens a native `<dialog>` (top layer, so the composer's overflow
 * cannot clip it) that edits the shared settings store: a master switch plus
 * one row per situation with effect, volume, preview, and an optional uploaded
 * clip. All copy is bilingual inline because the plugin does not register a
 * locale namespace.
 */

import * as React from 'react';

import { EFFECT_LABELS, EFFECT_PRESETS, playEvent } from './effects';
import type { CueScope, EventSettings, Settings, SettingsStore } from './settings';
import { EVENT_LABELS, EVENT_ORDER, MAX_CLIP_BYTES, SCOPE_LABELS, defaultEvent, defaultSettings } from './settings';

const h: any = React.createElement;

const PANEL_STYLE = {
  position: 'fixed',
  inset: 'auto 20px 70px auto',
  margin: 0,
  padding: '14px 16px 12px',
  width: 372,
  maxHeight: '74vh',
  overflow: 'auto',
  border: '1px solid var(--dsw-alias-border-l2, rgba(127, 127, 127, 0.35))',
  borderRadius: 12,
  background: 'var(--dsw-alias-bg-module-platform, #ffffff)',
  color: 'var(--dsw-alias-label-primary, #1f2329)',
  boxShadow: '0 16px 40px rgba(0, 0, 0, 0.28)',
  font: 'inherit',
  fontSize: 13,
  lineHeight: 1.45,
};

const ROW_STYLE = {
  padding: '8px 0',
  borderTop: '1px solid var(--dsw-alias-border-l2, rgba(127, 127, 127, 0.2))',
};

const SMALL_BUTTON = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  height: 24,
  minWidth: 24,
  padding: '0 8px',
  border: '1px solid var(--dsw-alias-border-l2, rgba(127, 127, 127, 0.35))',
  borderRadius: 6,
  background: 'transparent',
  color: 'inherit',
  cursor: 'pointer',
  fontSize: 12,
  lineHeight: 1,
};

const MUTED_TEXT = { color: 'var(--dsw-alias-label-secondary, #7a8190)' };

function SpeakerGlyph({ muted }: { muted: boolean }): any {
  const stroked = {
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.3,
    strokeLinecap: 'round',
  } as const;
  const waves = muted
    ? h('path', { d: 'M10.6 6.2l3.3 3.3M13.9 6.2l-3.3 3.3', ...stroked })
    : h('path', { d: 'M10.7 5.7a3.3 3.3 0 0 1 0 4.6M12.6 4.4a5.2 5.2 0 0 1 0 7.2', ...stroked });
  return h(
    'svg',
    { width: 14, height: 14, viewBox: '0 0 16 16', 'aria-hidden': true, style: { display: 'block' } },
    h('path', { d: 'M3 6.4h2.3L8.5 3.8v8.4L5.3 9.6H3z', fill: 'currentColor' }),
    waves,
  );
}

function PreviewGlyph(): any {
  return h(
    'svg',
    { width: 12, height: 12, viewBox: '0 0 16 16', 'aria-hidden': true, style: { display: 'block' } },
    h('path', { d: 'M4.5 3.2v9.6L12.8 8z', fill: 'currentColor' }),
  );
}

export interface SoundControlOptions {
  /** Optional hook for the plugin to expose the current panel state in tests. */
  onPanelOpened?: () => void;
}

/** Build the dock button component bound to one settings store. */
export function createSoundControl(store: SettingsStore, options: SoundControlOptions = {}): any {
  function useSettings(): Settings {
    const [settings, setSettings] = React.useState(store.get);
    React.useEffect(() => {
      setSettings(store.get());
      return store.subscribe(() => setSettings(store.get()));
    }, []);
    return settings;
  }

  function readClip(event: EventKey, file: File, onDone: (patch: Partial<EventSettings> | undefined, error?: string) => void): void {
    if (file.size > MAX_CLIP_BYTES) {
      onDone(undefined, `文件太大（上限 ${Math.round(MAX_CLIP_BYTES / 1024)} KB）`);
      return;
    }
    if (typeof FileReader === 'undefined') {
      onDone(undefined, '当前环境不支持读取本地文件');
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => onDone(undefined, '读取音频文件失败');
    reader.onload = () => {
      const dataUrl = typeof reader.result === 'string' ? reader.result : '';
      if (!dataUrl.startsWith('data:audio/')) {
        onDone(undefined, '所选文件不是浏览器可播放的音频');
        return;
      }
      onDone({ effect: 'custom', custom: { name: file.name, dataUrl } });
    };
    reader.readAsDataURL(file);
  }

  /** Transient per-row messages keyed by `scope:event`; file callbacks write them. */
  const errorKey = (scope: CueScope, event: EventKey): string => `${scope}:${event}`;

  function pickFile(event: EventKey, scope: CueScope): void {
    try {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'audio/*';
      input.style.display = 'none';
      input.onchange = () => {
        const file = input.files?.[0];
        if (file === undefined) return;
        readClip(event, file, (patch, error) => {
          const key = errorKey(scope, event);
          if (error !== undefined) {
            errors.set(key, error);
            return;
          }
          errors.set(key, undefined);
          if (patch !== undefined) {
            store.updateEvent(event, patch, scope);
            playEvent(event, store.get(), scope, { preview: true });
          }
        });
        errors.render();
      };
      document.body.appendChild(input);
      input.click();
      setTimeout(() => input.remove(), 0);
    } catch {
      /* file picking is optional */
    }
  }

  /** Per-row transient error messages; kept outside React state so file callbacks can write them. */
  const errors = (() => {
    let listeners: Array<() => void> = [];
    const values = new Map<string, string | undefined>();
    return {
      get: (key: string) => values.get(key),
      set: (key: string, message: string | undefined) => {
        values.set(key, message);
      },
      subscribe: (listener: () => void) => {
        listeners = [...listeners, listener];
        return () => {
          listeners = listeners.filter((entry) => entry !== listener);
        };
      },
      render: () => {
        for (const listener of listeners) listener();
      },
    };
  })();

  function EffectRow({ event, scope }: { event: EventKey; scope: CueScope }): any {
    const settings = useSettings();
    const [, forceRender] = React.useState(0);
    React.useEffect(() => errors.subscribe(() => forceRender((value) => value + 1)), []);
    const config = scope === 'subagent' ? settings.subagent.events[event] : settings.events[event];
    const error = errors.get(errorKey(scope, event));
    const label = EVENT_LABELS[event];
    const isCustom = config.effect === 'custom' && config.custom !== undefined;
    const options = [
      ...EFFECT_PRESETS.map((preset) => ({
        value: preset.id as string,
        label: `${preset.label.zh} / ${preset.label.en}`,
      })),
      { value: 'silent', label: '无（静音） / Silent' },
      ...(isCustom ? [{ value: 'custom', label: `自定义音频 / ${config.custom!.name}` }] : []),
    ];
    const preview = () => playEvent(event, store.get(), scope, { preview: true });
    const setVolume = (value: number) => {
      store.updateEvent(event, { volume: Math.min(1, Math.max(0, value / 100)) }, scope);
    };
    return h(
      'div',
      { style: ROW_STYLE, 'data-sound-event': event, 'data-sound-scope': scope },
      h(
        'div',
        { style: { display: 'flex', alignItems: 'center', gap: 8 } },
        h('span', { style: { minWidth: 68, fontWeight: 500 } }, label.zh),
        h(
          'select',
          {
            value: config.effect,
            'aria-label': `${SCOPE_LABELS[scope].zh}${label.zh}音效`,
            onChange: (changeEvent: any) => {
              const next = changeEvent.target.value as EventSettings['effect'];
              store.updateEvent(event, { effect: next }, scope);
              if (next !== 'silent') playEvent(event, store.get(), scope, { preview: true });
            },
            style: {
              flex: 1,
              minWidth: 0,
              height: 26,
              borderRadius: 6,
              border: '1px solid var(--dsw-alias-border-l2, rgba(127, 127, 127, 0.35))',
              background: 'transparent',
              color: 'inherit',
              font: 'inherit',
              fontSize: 12,
            },
          },
          ...options.map((option) => h('option', { key: option.value, value: option.value }, option.label)),
        ),
        h(
          'button',
          {
            type: 'button',
            title: '试听 / Preview',
            'aria-label': `试听${SCOPE_LABELS[scope].zh}${label.zh}`,
            style: SMALL_BUTTON,
            onClick: preview,
          },
          h(PreviewGlyph),
        ),
      ),
      h(
        'div',
        { style: { display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 } },
        h(
          'input',
          {
            type: 'range',
            min: 0,
            max: 100,
            step: 5,
            value: Math.round(config.volume * 100),
            'aria-label': `${SCOPE_LABELS[scope].zh}${label.zh}音量`,
            onChange: (changeEvent: any) => setVolume(Number(changeEvent.target.value)),
            onPointerUp: preview,
            style: { flex: 1, accentColor: 'var(--dsw-alias-brand-primary, #247bbf)' },
          },
        ),
        h('span', { style: { minWidth: 38, textAlign: 'right', ...MUTED_TEXT } }, `${Math.round(config.volume * 100)}%`),
      ),
      h(
        'div',
        { style: { display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 } },
        h(
          'button',
          { type: 'button', style: SMALL_BUTTON, onClick: () => pickFile(event, scope) },
          isCustom ? '更换音频… / Replace…' : '自定义音频… / Choose file…',
        ),
        isCustom
          ? h(
              'span',
              { style: { flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', ...MUTED_TEXT } },
              config.custom!.name,
            )
          : h('span', { style: { ...MUTED_TEXT } }, `≤ ${Math.round(MAX_CLIP_BYTES / 1024)} KB`),
        h(
          'button',
          {
            type: 'button',
            style: SMALL_BUTTON,
            title: '恢复本行默认 / Reset row',
            onClick: () => store.updateEvent(event, { ...defaultEvent(event, scope), custom: undefined }, scope),
          },
          '重置',
        ),
      ),
      error !== undefined ? h('div', { style: { marginTop: 4, color: '#d9534f' } }, error) : null,
    );
  }

  function SoundPanel({ onClose }: { onClose: () => void }): any {
    const settings = useSettings();
    const [saveError, setSaveError] = React.useState<string | undefined>(undefined);
    const dialogRef = React.useRef<any>(null);
    React.useEffect(() => {
      const dialog = dialogRef.current;
      if (dialog === null) return undefined;
      try {
        if (typeof dialog.showModal === 'function' && !dialog.open) dialog.showModal();
        else dialog.setAttribute('open', '');
      } catch {
        /* fall back to the styled fixed panel */
      }
      options.onPanelOpened?.();
      return () => {
        try {
          if (typeof dialog.close === 'function') dialog.close();
        } catch {
          /* already closed */
        }
      };
    }, []);
    const apply = (result: { ok: boolean; error?: string }) => {
      setSaveError(result.ok ? undefined : `保存失败：${result.error ?? '本地存储不可用'}`);
    };
    const toggleMaster = (enabled: boolean) => apply(store.setEnabled(enabled));
    const reset = () => apply(store.set(defaultSettings()));
    return h(
      'dialog',
      {
        ref: dialogRef,
        className: 'dsh-sound-notify-panel',
        'aria-label': '提示音设置 / Notification sounds',
        style: PANEL_STYLE,
        onCancel: (cancelEvent: any) => {
          cancelEvent.preventDefault();
          onClose();
        },
        onClick: (clickEvent: any) => {
          if (clickEvent.target === dialogRef.current) onClose();
        },
      },
      h(
        'style',
        null,
        '.dsh-sound-notify-panel::backdrop{background:rgba(15,20,28,0.18);}',
      ),
      h(
        'div',
        { style: { display: 'flex', alignItems: 'center', gap: 8 } },
        h('strong', { style: { flex: 1, fontSize: 14 } }, '提示音设置 / Notification sounds'),
        h(
          'button',
          { type: 'button', style: SMALL_BUTTON, 'aria-label': '关闭', onClick: onClose },
          '✕',
        ),
      ),
      h(
        'label',
        { style: { display: 'flex', alignItems: 'center', gap: 8, margin: '10px 0 4px', cursor: 'pointer' } },
        h('input', {
          type: 'checkbox',
          checked: settings.enabled,
          onChange: (changeEvent: any) => toggleMaster(changeEvent.target.checked === true),
        }),
        h('span', null, '启用提示音 / Enable sounds'),
        h('span', { style: { marginLeft: 'auto', ...MUTED_TEXT } }, 'alt+点击图标可快速静音'),
      ),
      h(
        'div',
        { style: { marginTop: 6, paddingTop: 8, borderTop: '1px solid var(--dsw-alias-border-l2, rgba(127, 127, 127, 0.2))' } },
        h('span', { style: { fontWeight: 600, fontSize: 12 } }, '主智能体 / Main agent'),
      ),
      ...EVENT_ORDER.map((event) => h(EffectRow, { key: `main:${event}`, event, scope: 'main' })),
      h(
        'div',
        { style: { marginTop: 10, paddingTop: 8, borderTop: '1px solid var(--dsw-alias-border-l2, rgba(127, 127, 127, 0.2))' } },
        h(
          'label',
          { style: { display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' } },
          h('input', {
            type: 'checkbox',
            checked: settings.subagent.enabled,
            onChange: (changeEvent: any) => apply(store.setSubagentEnabled(changeEvent.target.checked === true)),
          }),
          h('span', { style: { fontWeight: 600 } }, '子智能体 / Subagent'),
          h(
            'span',
            { style: { marginLeft: 'auto', ...MUTED_TEXT } },
            settings.subagent.enabled ? '已启用独立提示音' : '默认关闭',
          ),
        ),
        settings.subagent.enabled
          ? h(
              'div',
              null,
              h(
                'div',
                { style: { ...MUTED_TEXT, fontSize: 11, margin: '4px 0' } },
                '子会话（subagent）完成 / 提问 / 审批 / 计划待审时使用下面这组独立配置。',
              ),
              ...EVENT_ORDER.map((event) => h(EffectRow, { key: `subagent:${event}`, event, scope: 'subagent' })),
            )
          : h(
              'div',
              { style: { ...MUTED_TEXT, fontSize: 11, margin: '4px 0' } },
              '子会话的状态变化默认不发声；勾选后四类情况可单独设置音效与音量。',
            ),
      ),
      h(
        'div',
        { style: { display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--dsw-alias-border-l2, rgba(127, 127, 127, 0.2))' } },
        h('button', { type: 'button', style: SMALL_BUTTON, onClick: reset }, '恢复默认 / Reset all'),
        h(
          'span',
          { style: { marginLeft: 'auto', fontSize: 11, ...MUTED_TEXT } },
          saveError ?? '设置保存在本机浏览器存储中',
        ),
      ),
    );
  }

  return function SoundButton(): any {
    const settings = useSettings();
    const [open, setOpen] = React.useState(false);
    const label = settings.enabled
      ? '提示音：已开启，点击设置 / Notification sounds on, click to configure'
      : '提示音：已静音，点击设置 / Notification sounds muted, click to configure';
    return h(
      'span',
      { style: { display: 'inline-flex', alignItems: 'center', flex: 'none' } },
      h(
        'button',
        {
          type: 'button',
          'data-composer-stat': 'sound-notify',
          title: label,
          'aria-label': label,
          'aria-expanded': open,
          onClick: (clickEvent: any) => {
            if (clickEvent.altKey === true) {
              store.setEnabled(!store.get().enabled);
              return;
            }
            setOpen((value: boolean) => !value);
          },
          style: {
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 24,
            height: 24,
            padding: 0,
            border: 'none',
            borderRadius: 6,
            background: 'transparent',
            color: settings.enabled
              ? 'var(--dsw-alias-label-secondary, #7a8190)'
              : 'var(--dsw-alias-label-tertiary, #a0a6b1)',
            cursor: 'pointer',
            opacity: settings.enabled ? 1 : 0.6,
            flex: 'none',
          },
        },
        h(SpeakerGlyph, { muted: !settings.enabled }),
      ),
      open ? h(SoundPanel, { onClose: () => setOpen(false) }) : null,
    );
  };
}
