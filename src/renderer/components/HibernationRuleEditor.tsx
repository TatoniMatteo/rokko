import type { AppData } from '../../shared/contracts/model';
import type { HibernationRule, HibernationCondition } from '../../shared/hibernation/rules.mjs';
import { Button, Card, TextField } from './ui';
import { useI18n } from '../preferences/i18n';
export function HibernationRuleEditor({
  rule,
  data,
  serviceId,
  disabled,
  onChange,
  onRemove,
}: {
  rule: HibernationRule;
  data: AppData;
  serviceId?: string;
  disabled: boolean;
  onChange: (rule: HibernationRule) => void;
  onRemove: () => void;
}) {
  const t = useI18n();
  const patch = (index: number, condition: HibernationCondition) =>
    onChange({
      ...rule,
      conditions: rule.conditions.map((old, i) => (i === index ? condition : old)),
    });
  const dayNames = [
    t('Sunday'),
    t('Monday'),
    t('Tuesday'),
    t('Wednesday'),
    t('Thursday'),
    t('Friday'),
    t('Saturday'),
  ];
  const matchSelect = (
    <div>
      <label htmlFor={'match-' + rule.id}>{t('Hibernate when')}</label>
      <select
        id={'match-' + rule.id}
        value={rule.match}
        onChange={(event) => onChange({ ...rule, match: event.target.value as 'all' | 'any' })}
      >
        <option value="all">{t('All conditions match')}</option>
        <option value="any">{t('Any condition matches')}</option>
      </select>
    </div>
  );
  return (
    <Card className="hibernation-rule">
      <fieldset disabled={disabled} className="hibernation-fields">
        <legend>{t('Automatic rule')}</legend>
        <label className="notification-toggle">
          <input
            type="checkbox"
            checked={rule.enabled}
            onChange={(event) => onChange({ ...rule, enabled: event.target.checked })}
          />
          {t('Rule enabled')}
        </label>
        <div className="settings-grid">
          <TextField
            label={t('Rule name')}
            value={rule.id === 'startup' && rule.name === 'Hibernate at startup' ? t(rule.name) : rule.name}
            maxLength={48}
            required
            onChange={(event) => onChange({ ...rule, name: event.target.value })}
          />
          {serviceId && matchSelect}
          {!serviceId && (
            <div>
              <label htmlFor={'scope-' + rule.id}>{t('Apply to')}</label>
              <select
                id={'scope-' + rule.id}
                value={rule.scope.kind === 'all' ? 'all' : rule.scope.kind + ':' + rule.scope.id}
                onChange={(event) => {
                  const [kind, id] = event.target.value.split(':');
                  onChange({
                    ...rule,
                    scope:
                      kind === 'all'
                        ? { kind: 'all' }
                        : { kind: kind as 'workspace' | 'service', id },
                  });
                }}
              >
                <option value="all">{t('All services')}</option>
                <optgroup label={t('Workspaces')}>
                  {data.workspaces.map((workspace) => (
                    <option key={workspace.id} value={'workspace:' + workspace.id}>
                      {workspace.name}
                    </option>
                  ))}
                </optgroup>
                <optgroup label={t('Services')}>
                  {data.apps.map((service) => (
                    <option key={service.id} value={'service:' + service.id}>
                      {service.name}
                    </option>
                  ))}
                </optgroup>
              </select>
            </div>
          )}
        </div>
        {!serviceId && matchSelect}
        {rule.conditions.map((condition, index) => (
          <div className="hibernation-condition" key={index}>
            <div>
              <label htmlFor={rule.id + '-condition-' + index}>
                {t('Condition {number}', { number: index + 1 })}
              </label>
              <select
                id={rule.id + '-condition-' + index}
                value={condition.kind}
                onChange={(event) =>
                  patch(
                    index,
                    event.target.value === 'inactive'
                      ? { kind: 'inactive', minutes: 15 }
                      : event.target.value === 'outside-workspace'
                        ? { kind: 'outside-workspace' }
                        : event.target.value === 'startup'
                          ? { kind: 'startup' }
                        : {
                            kind: 'time',
                            start: '22:00',
                            end: '08:00',
                            days: [0, 1, 2, 3, 4, 5, 6],
                          },
                  )
                }
              >
                <option value="inactive">{t('Not used in the foreground')}</option>
                <option value="outside-workspace">{t('Outside the selected workspace')}</option>
                <option value="startup">{t('At Rokko startup')}</option>
                <option value="time">{t('Within a time window')}</option>
              </select>
            </div>
            {condition.kind === 'inactive' && (
              <TextField
                label={t('Minutes since last foreground use')}
                type="number"
                min={1}
                max={1440}
                required
                value={Number.isFinite(condition.minutes) ? condition.minutes : ''}
                onChange={(event) =>
                  patch(index, { ...condition, minutes: event.target.valueAsNumber })
                }
              />
            )}
            {condition.kind === 'time' && (
              <>
                <div className="settings-grid">
                  <TextField
                    label={t('From')}
                    type="time"
                    required
                    value={condition.start}
                    onChange={(event) => patch(index, { ...condition, start: event.target.value })}
                  />
                  <TextField
                    label={t('Until')}
                    type="time"
                    required
                    value={condition.end}
                    onChange={(event) => patch(index, { ...condition, end: event.target.value })}
                  />
                </div>
                <fieldset className="hibernation-days">
                  <legend>{t('Starting days')}</legend>
                  {[1, 2, 3, 4, 5, 6, 0].map((day) => (
                    <label key={day}>
                      <input
                        type="checkbox"
                        checked={condition.days.includes(day)}
                        onChange={(event) =>
                          patch(index, {
                            ...condition,
                            days: event.target.checked
                              ? [...condition.days, day]
                              : condition.days.filter((value) => value !== day),
                          })
                        }
                      />
                      {dayNames[day]}
                    </label>
                  ))}
                </fieldset>
              </>
            )}
            <Button
              variant="secondary"
              disabled={rule.conditions.length === 1}
              onClick={() =>
                onChange({ ...rule, conditions: rule.conditions.filter((_, i) => i !== index) })
              }
            >
              {t('Remove condition')}
            </Button>
          </div>
        ))}
        <div className="page-actions">
          <Button
            variant="secondary"
            disabled={rule.conditions.length >= 6}
            onClick={() =>
              onChange({
                ...rule,
                conditions: [...rule.conditions, { kind: 'inactive', minutes: 15 }],
              })
            }
          >
            {t('Add condition')}
          </Button>
          <Button variant="danger-button" onClick={onRemove}>
            {t('Remove rule')}
          </Button>
        </div>
      </fieldset>
    </Card>
  );
}
