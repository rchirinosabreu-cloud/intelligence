import { es } from 'date-fns/locale';
import { registerLocale } from 'react-datepicker';

registerLocale('es', es);

export const brainDatePickerProps = {
  locale: 'es',
  calendarClassName: 'brain-datepicker',
  popperClassName: 'brain-datepicker-popper',
  showPopperArrow: false
};
