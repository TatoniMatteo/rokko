import type { CSSProperties } from 'react';
import { Icon } from './Icon';
import { useI18n } from '../preferences/i18n';

const presets = [
  { name: 'Blue', value: '#245dc5' },
  { name: 'Teal', value: '#16857b' },
  { name: 'Green', value: '#4b7d32' },
  { name: 'Amber', value: '#bd7b16' },
  { name: 'Rose', value: '#bf4b6c' },
  { name: 'Purple', value: '#8154bb' },
];

export function SeedColorPicker({
  value,
  disabled,
  onChange,
}: {
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  const t = useI18n();
  const custom = !presets.some((preset) => preset.value === value.toLowerCase());
  return (
    <fieldset className="seed-picker" disabled={disabled}>
      <legend>{t('Seed color')}</legend>
      <div className="seed-swatches">
        {presets.map((preset) => (
          <button
            type="button"
            className="seed-swatch"
            key={preset.value}
            style={{ '--swatch-color': preset.value } as CSSProperties}
            aria-label={t(preset.name)}
            data-tooltip={t(preset.name)}
            aria-pressed={value.toLowerCase() === preset.value}
            onClick={() => onChange(preset.value)}
          />
        ))}
        <label
          className="seed-swatch seed-custom"
          data-selected={custom}
          data-tooltip={t('Choose a custom color')}
          style={{ '--swatch-color': value } as CSSProperties}
        >
          <Icon name="plus" size={16} />
          <input
            type="color"
            id="seed"
            value={value}
            aria-label={t('Choose a custom color')}
            onChange={(event) => onChange(event.target.value)}
          />
        </label>
      </div>
    </fieldset>
  );
}
