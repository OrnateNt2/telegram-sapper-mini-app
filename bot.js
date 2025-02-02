// bot.js
require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');

if (!process.env.TELEGRAM_BOT_TOKEN) {
  console.error('Пожалуйста, задайте TELEGRAM_BOT_TOKEN в .env файле');
  process.exit(1);
}

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

// ===== Параметры игры по умолчанию и настройки сложности =====
const defaultSettings = { rows: 5, cols: 5, mines: 5 };

const difficulties = {
  easy:   { rows: 5,  cols: 5,  mines: 3 },
  medium: { rows: 7,  cols: 7,  mines: 10 },
  hard:   { rows: 10, cols: 10, mines: 20 }
};

// Объекты для хранения текущих игр и настроек по chat_id
const games = {};
const chatSettings = {};

// ===== Функции создания и обработки игры =====

// Создание новой игры по заданным параметрам
function createGame(rows, cols, mineCount) {
  const board = [];
  for (let r = 0; r < rows; r++) {
    board[r] = [];
    for (let c = 0; c < cols; c++) {
      board[r][c] = {
        mine: false,
        revealed: false,
        adjacent: 0,
      };
    }
  }

  // Расставляем мины случайным образом
  let minesPlaced = 0;
  while (minesPlaced < mineCount) {
    const r = Math.floor(Math.random() * rows);
    const c = Math.floor(Math.random() * cols);
    if (!board[r][c].mine) {
      board[r][c].mine = true;
      minesPlaced++;
    }
  }

  // Подсчитываем количество мин вокруг каждой клетки
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (board[r][c].mine) continue;
      let count = 0;
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (dr === 0 && dc === 0) continue;
          const nr = r + dr;
          const nc = c + dc;
          if (nr >= 0 && nr < rows && nc >= 0 && nc < cols) {
            if (board[nr][nc].mine) count++;
          }
        }
      }
      board[r][c].adjacent = count;
    }
  }

  return { board, rows, cols, mineCount, over: false, win: false };
}

// Рекурсивное открытие клеток, если вокруг нет мин
function revealCell(game, r, c) {
  const cell = game.board[r][c];
  if (cell.revealed) return;
  cell.revealed = true;
  if (!cell.mine && cell.adjacent === 0) {
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue;
        const nr = r + dr;
        const nc = c + dc;
        if (nr >= 0 && nr < game.rows && nc >= 0 && nc < game.cols) {
          if (!game.board[nr][nc].revealed) {
            revealCell(game, nr, nc);
          }
        }
      }
    }
  }
}

// Проверка на победу: если открыты все клетки, где нет мин
function isWin(game) {
  for (let r = 0; r < game.rows; r++) {
    for (let c = 0; c < game.cols; c++) {
      const cell = game.board[r][c];
      if (!cell.mine && !cell.revealed) return false;
    }
  }
  return true;
}

// Отрисовка игрового поля в виде inline-клавиатуры
function renderBoard(game, revealAll = false) {
  const keyboard = [];
  for (let r = 0; r < game.rows; r++) {
    const row = [];
    for (let c = 0; c < game.cols; c++) {
      const cell = game.board[r][c];
      let text = '❓'; // закрытая клетка
      if (revealAll || cell.revealed) {
        if (cell.mine) {
          text = '💣';
        } else if (cell.adjacent > 0) {
          text = String(cell.adjacent);
        } else {
          text = '▫️';
        }
      }
      // callback_data формата: cell_ряд_столбец
      row.push(Markup.button.callback(text, `cell_${r}_${c}`));
    }
    keyboard.push(row);
  }
  return Markup.inlineKeyboard(keyboard);
}

// Отрисовка главного меню
function renderMainMenu() {
  return Markup.inlineKeyboard([
    [Markup.button.callback('Новая игра', 'menu_new_game')],
    [Markup.button.callback('Настройки', 'menu_settings')],
    [Markup.button.callback('Правила', 'menu_help')]
  ]);
}

// Отрисовка меню настроек (выбор сложности)
function renderSettingsMenu() {
  return Markup.inlineKeyboard([
    [Markup.button.callback('Легко', 'set_easy')],
    [Markup.button.callback('Нормально', 'set_medium')],
    [Markup.button.callback('Сложно', 'set_hard')],
    [Markup.button.callback('Назад', 'menu_back')]
  ]);
}

// ===== Команды бота =====

// Команда /start — приветствие и показ главного меню
bot.start(ctx => {
  ctx.reply('Добро пожаловать в Сапёр! Выберите опцию из меню:', renderMainMenu());
});

// Команда /menu — показать главное меню
bot.command('menu', ctx => {
  ctx.reply('Меню:', renderMainMenu());
});

// Команда /new — начать новую игру с текущими настройками
bot.command('new', ctx => {
  const chatId = ctx.chat.id;
  const settings = chatSettings[chatId] || defaultSettings;
  const game = createGame(settings.rows, settings.cols, settings.mines);
  games[chatId] = game;
  ctx.reply('Новая игра. Выберите клетку:', renderBoard(game));
});

// Команда /settings — открыть меню настроек
bot.command('settings', ctx => {
  ctx.reply('Выберите сложность:', renderSettingsMenu());
});

// ===== Обработка callback_query =====
bot.on('callback_query', async ctx => {
  const data = ctx.callbackQuery.data;
  const chatId = ctx.chat.id;

  // Обработка команд главного меню
  if (data.startsWith('menu_')) {
    if (data === 'menu_new_game') {
      const settings = chatSettings[chatId] || defaultSettings;
      const game = createGame(settings.rows, settings.cols, settings.mines);
      games[chatId] = game;
      await ctx.editMessageText('Новая игра. Выберите клетку:', renderBoard(game));
      return ctx.answerCbQuery();
    } else if (data === 'menu_settings') {
      await ctx.editMessageText('Выберите сложность:', renderSettingsMenu());
      return ctx.answerCbQuery();
    } else if (data === 'menu_help') {
      await ctx.editMessageText(
        'Правила игры Сапёр:\n' +
        '1. Открывайте клетки, стараясь не попасть на мину.\n' +
        '2. Если открыта клетка с числом — оно показывает, сколько мин находится в соседних клетках.\n' +
        '3. Игра выигрывается, если открыть все безопасные клетки.\n\n' +
        'Нажмите "Новая игра", чтобы начать игру.',
        renderMainMenu()
      );
      return ctx.answerCbQuery();
    } else if (data === 'menu_back') {
      await ctx.editMessageText('Меню:', renderMainMenu());
      return ctx.answerCbQuery();
    }
  }

  // Обработка выбора настроек
  if (data.startsWith('set_')) {
    if (data === 'set_easy') {
      chatSettings[chatId] = difficulties.easy;
      await ctx.answerCbQuery('Настройки установлены: Легко');
      await ctx.editMessageText('Настройки сохранены: Легко', renderMainMenu());
      return;
    } else if (data === 'set_medium') {
      chatSettings[chatId] = difficulties.medium;
      await ctx.answerCbQuery('Настройки установлены: Нормально');
      await ctx.editMessageText('Настройки сохранены: Нормально', renderMainMenu());
      return;
    } else if (data === 'set_hard') {
      chatSettings[chatId] = difficulties.hard;
      await ctx.answerCbQuery('Настройки установлены: Сложно');
      await ctx.editMessageText('Настройки сохранены: Сложно', renderMainMenu());
      return;
    }
  }

  // Если игра не активна — уведомляем об окончании игры
  if (!games[chatId] || games[chatId].over) {
    return ctx.answerCbQuery('Игра окончена. Введите /new или выберите "Новая игра" в меню.');
  }

  // Обработка нажатия на игровое поле (кнопки с данными вида cell_ряд_столбец)
  if (data.startsWith('cell_')) {
    const parts = data.split('_');
    const r = parseInt(parts[1], 10);
    const c = parseInt(parts[2], 10);
    const game = games[chatId];
    const cell = game.board[r][c];

    if (cell.revealed) {
      return ctx.answerCbQuery('Эта клетка уже открыта.');
    }

    if (cell.mine) {
      cell.revealed = true;
      game.over = true;
      await ctx.editMessageReplyMarkup(renderBoard(game, true).reply_markup);
      ctx.answerCbQuery('💥 Вы проиграли!');
      return ctx.reply('💥 Игра окончена. Введите /new или выберите "Новая игра" в меню.');
    } else {
      revealCell(game, r, c);
      if (isWin(game)) {
        game.over = true;
        game.win = true;
        await ctx.editMessageReplyMarkup(renderBoard(game, true).reply_markup);
        ctx.answerCbQuery('🎉 Вы выиграли!');
        return ctx.reply('🎉 Поздравляем, вы выиграли! Введите /new или выберите "Новая игра" в меню.');
      } else {
        await ctx.editMessageReplyMarkup(renderBoard(game).reply_markup);
        return ctx.answerCbQuery();
      }
    }
  }
});

// Запуск бота
bot.launch().then(() => {
  console.log('Бот запущен...');
});

// Остановка бота при завершении процесса
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
