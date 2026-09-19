// The board's reference, in the panel rather than in a wiki nobody opens.
//
// Written as a reference and not as a tour: what the thing is, what it is
// for, what to press. Every example is the real syntax, and the ones worth
// trying have a copy button, because a manual you have to retype from is a
// manual you close.

import { useState } from 'react'
import { Check, Copy } from 'lucide-react'
import { NOTE_FONTS } from './pins/noteStyles'
import { DECOR_ITEMS, ANIMATED_DECOR_ITEMS, TEMPLATE_COUNT } from './TemplatePanel'
import styles from './HelpPanel.module.css'

function Keys({ children }: { children: string }) {
  return (
    <span className={styles.keys}>
      {children.split('+').map((k, i) => (
        <kbd key={i} className={styles.kbd}>
          {k}
        </kbd>
      ))}
    </span>
  )
}

function Sample({ code }: { code: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <div className={styles.sample}>
      <pre className={styles.sampleCode}>{code}</pre>
      <button
        type="button"
        className={styles.copy}
        title="Скопировать"
        aria-label="Скопировать пример"
        onClick={() => {
          void navigator.clipboard.writeText(code).then(
            () => {
              setCopied(true)
              setTimeout(() => setCopied(false), 1400)
            },
            // Clipboard access can be refused; saying nothing would look
            // like the button is broken.
            () => setCopied(false),
          )
        }}
      >
        {copied ? <Check size={13} /> : <Copy size={13} />}
      </button>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className={styles.section}>
      <h3 className={styles.h}>{title}</h3>
      {children}
    </section>
  )
}

function Row({ left, children }: { left: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className={styles.row}>
      <div className={styles.rowLeft}>{left}</div>
      <div className={styles.rowRight}>{children}</div>
    </div>
  )
}

export function HelpPanel() {
  return (
    <div className={styles.wrap}>
      <p className={styles.lead}>
        Доска — бесконечный холст поверх того же WebDAV-хранилища, что и файлы. Всё, что на ней
        лежит, сохраняется само: отдельный файл доски рядом с заметками, без своей базы.
      </p>

      <Section title="Холст">
        <Row left={<Keys>колесо</Keys>}>Прокрутка по вертикали, с <Keys>Shift</Keys> — по горизонтали.</Row>
        <Row left={<Keys>Ctrl+колесо</Keys>}>Масштаб от 25% до 400%. Точка под курсором остаётся на месте.</Row>
        <Row left="Тяга пустого места">Панорама. На тачпаде — щипок двумя пальцами.</Row>
        <Row left={<Keys>Alt+тяга</Keys>}>Рамка выделения. Без Alt тяга по пустому месту двигает холст.</Row>
        <Row left="Кнопка «развернуть»">Подогнать масштаб так, чтобы вся доска влезла в окно.</Row>
        <Row left={<Keys>Ctrl+A</Keys>}>Выделить всё, <Keys>Escape</Keys> — снять выделение.</Row>
        <Row left={<Keys>Ctrl+F</Keys>}>
          Поиск по доске: ищет по тексту заметок, именам файлов, адресам ссылок и типу объекта.
          Совпадения обводятся, <Keys>Enter</Keys> перелистывает их по кругу и подводит холст к
          каждому, <Keys>Shift+Enter</Keys> — назад.
        </Row>
        <Row left={<Keys>Ctrl+Z</Keys>}>
          Отменить, <Keys>Ctrl+Shift+Z</Keys> или <Keys>Ctrl+Y</Keys> — вернуть. Работает на любой
          раскладке: отслеживается физическая клавиша, а не буква.
        </Row>
      </Section>

      <Section title="Объекты">
        <Row left="Двойной клик по пустому месту">Новая заметка прямо там.</Row>
        <Row left="Правая кнопка">
          Меню: заметка, заметка из хранилища (.md), ссылка, фигура, файл. По объекту — его
          собственное меню.
        </Row>
        <Row left={<Keys>Enter</Keys>}>Редактировать выделенное. Просто начать печатать — то же самое.</Row>
        <Row left={<Keys>Escape</Keys>}>Выйти из редактирования, сохранив. Второй раз — снять выделение.</Row>
        <Row left={<Keys>Delete</Keys>}>Удалить выделенное. Выделенная связь удаляется раньше пинов.</Row>
        <Row left="Перетаскивание">
          Объекты расталкивают друг друга и не налезают. Это отключается в настройках доски.
        </Row>
        <Row left="Порты по краям">Тяга от порта к другому объекту — связь между ними.</Row>
        <Row left="Файлы из ОС">
          Перетащи в окно — картинки, видео, аудио, PDF лягут на доску и загрузятся в хранилище.
          Папка тоже.
        </Row>
      </Section>

      <Section title="Форматирование текста">
        <p className={styles.note}>
          Панель появляется над заметкой, когда выделена ровно одна. Повторный клик по активной
          кнопке снимает её и возвращает то, что задаёт стиль заметки.
        </p>
        <Row left="Гарнитура">
          {NOTE_FONTS.length} штук, сгруппированы. В правом меню заметки — пять самых ходовых на
          этой доске; весь список здесь, в панели.
        </Row>
        <Row left="Кегль">Степпер, ручной ввод, и «подогнать» — подбирает максимальный размер, при котором текст ещё влезает в рамку.</Row>
        <Row left="Выравнивание">По горизонтали — четыре, по вертикали — три.</Row>
        <Row left="Интервалы">Межстрочный множителем, межбуквенный в сотых em.</Row>
        <Row left="Сброс">Кнопка появляется, только когда есть что сбрасывать.</Row>
      </Section>

      <Section title="Разметка внутри заметки">
        <p className={styles.note}>
          Заметка — это markdown. Пока редактируешь — исходник, как только вышел — свёрстанный текст.
        </p>
        <Row left={<Keys>Ctrl+B</Keys>}>Жирный, <Keys>Ctrl+I</Keys> — курсив, <Keys>Ctrl+E</Keys> — моноширинный.</Row>
        <Row left={<Keys>Ctrl+K</Keys>}>Ссылка: курсор сразу встаёт внутрь скобок для адреса.</Row>
        <Row left={<Keys>Ctrl+Shift+8</Keys>}>Список, <Keys>Ctrl+Shift+7</Keys> — нумерованный, <Keys>Ctrl+Shift+C</Keys> — чек-лист, <Keys>Ctrl+Shift+.</Keys> — цитата.</Row>
        <Row left={<Keys>Ctrl+Shift+X</Keys>}>Зачёркнутый.</Row>

        <p className={styles.note}>Таблицы, чек-листы и заголовки — обычный GitHub-markdown:</p>
        <Sample
          code={'## Заголовок\n\n- [x] сделано\n- [ ] нет\n\n| узел | адрес |\n|---|---|\n| MikroTik | 10.0.0.1 |'}
        />

        <p className={styles.note}>Формулы — KaTeX, в строке и блоком:</p>
        <Sample code={'Пропускная способность $C = B\\log_2(1 + S/N)$\n\n$$\\sum_{i=1}^{n} x_i^2$$'} />

        <p className={styles.note}>Код подсвечивается, язык — после тройных кавычек:</p>
        <Sample code={'```bash\nif [ -f /etc/nginx/nginx.conf ]; then\n  nginx -t\nfi\n```'} />

        <p className={styles.note}>
          Диаграммы — mermaid. Рисуется прямо в заметке, перекрашена под тему доски:
        </p>
        <Sample
          code={'```mermaid\ngraph LR\n  A[Заметка] --> B[WebDAV]\n  B --> C[iPhone]\n```'}
        />
        <p className={styles.note}>
          Работают и другие типы: <code>sequenceDiagram</code>, <code>flowchart</code>,{' '}
          <code>gantt</code>, <code>pie</code>, <code>stateDiagram-v2</code>. Пока диаграмма
          недописана, на её месте показывается ошибка разбора — это нормально, заметка от этого не
          ломается.
        </p>
      </Section>

      <Section title="Шаблоны, штучки, анимации">
        <Row left="Вкладка «Шаблоны»">
          {TEMPLATE_COUNT} стилей заметки. Клик кладёт заметку на доску; если выделена одна заметка —
          меняет стиль ей. Перетаскиванием — ляжет туда, куда бросил.
        </Row>
        <Row left="Штучки">
          {DECOR_ITEMS.length} неподвижных и {ANIMATED_DECOR_ITEMS.length} анимированных. Тащи на
          заметку — прицепится там, куда бросил.
        </Row>
        <Row left="Уже прицепленные">
          Таскаются по заметке, размер — за угловой уголок, снять — крестик. Позиция хранится долей
          от рамки, поэтому при ресайзе заметки ничего не разъезжается.
        </Row>
        <Row left="Размер заметки">
          Пока набираешь, заметка растёт под текст сама — только вниз, чтобы не прыгала при
          стирании. Ужать обратно ровно по тексту — правое меню → «Подогнать высоту под текст».
        </Row>
        <Row left="Цвет текста">
          Кнопка с буквой и цветной полоской в панели форматирования (появляется при выделении
          заметки). Правый клик по ней — вернуть автоматический цвет. Работает и на HUD-стилях.
        </Row>
        <Row left="Перечеркнуть">
          Правое меню → «Перечеркнуть — сделано», или <Keys>Ctrl+Enter</Keys> по выделению.
          Карточка остаётся на доске и читаемой, просто помечена выполненной. Работает для
          любых пинов, не только заметок; снимается тем же способом.
        </Row>
        <Row left="Реакции">
          Правое меню заметки → «Реакция», или клик по уже стоящей — счётчик. Убрать одну —{' '}
          <Keys>Shift+клик</Keys>, снять совсем — правый клик по значку, все сразу — «Убрать все
          реакции» в том же подменю. Ряд значков таскается по заметке за любой из них; позиция
          хранится долей от рамки, как у штучек. Размер — степпер «Размер» в том же подменю,
          от 50% до 200%.
        </Row>
      </Section>

      <Section title="Связь с хранилищем">
        <Row left="Заметка из хранилища">
          Привязана к .md-файлу: файл — источник правды, правки уезжают в него. Внизу заметки —
          имя файла, красным, если файл недоступен.
        </Row>
        <Row left="«Сохранить в хранилище»">Превращает обычную заметку в привязанную.</Row>
        <Row left="Отвязать">Оставляет текст на доске, файл больше не трогается.</Row>
      </Section>

      <Section title="AI">
        <Row left="Вкладка «AI»">
          DeepSeek через прокси на своём сервере — ключ лежит на сервере, браузер его не видит.
        </Row>
        <Row left="Что умеет">
          Читает доску и отвечает по ней; может добавить заметки и разложить их — предложенные
          изменения применяются кнопкой, а не молча.
        </Row>
        <Row left="По объекту">
          Правое меню → AI: пересказать, продолжить, разобрать на пункты — для конкретной заметки.
        </Row>
      </Section>

      <Section title="Выгрузка">
        <Row left="PNG и PDF">
          Кнопки на нижней панели. Снимается вся доска целиком, а не то, что на экране: пины,
          которые холст не рисовал ради скорости, на время выгрузки монтируются.
        </Row>
        <Row left="Что не попадёт">Рамки выделения, ручки ресайза и порты — это интерфейс, не содержимое.</Row>
        <Row left="Очень большая доска">
          Масштаб снимка автоматически снижается: холст браузера конечен, и превышение даёт не
          большую картинку, а пустую.
        </Row>
      </Section>

      <Section title="Сохранение">
        <Row left="Автоматически">Через полсекунды после последней правки. Состояние — в шапке доски.</Row>
        <Row left="Конфликт">
          Если ту же доску правили с другого устройства, запись останавливается и предлагается
          выбор — перезаписать или перечитать. Молча ничего не теряется.
        </Row>
        <Row left="Закрытие вкладки">
          Если правка не успела сохраниться, браузер переспросит перед закрытием.
        </Row>
      </Section>
    </div>
  )
}
