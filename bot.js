// bot.js
require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');

if (!process.env.TELEGRAM_BOT_TOKEN) {
  console.error('Пожалуйста, задайте TELEGRAM_BOT_TOKEN в .env файле');
  process.exit(1);
}

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

// Настройки игры: размер поля и количество мин
const GAME_ROWS = 5;
const GAME_COLS = 5;
const MINE_COUNT = 5;

// Объект для хранения игр по chat_id
const games = {};

// Создание новой игры
function createGame(rows, cols, mineCount) {
  // Инициализируем поле
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
  
  // Случайно расставляем мины
  let minesPlaced = 0;
  while (minesPlaced < mineCount) {
    const r = Math.floor(Math.random() * rows);
    const c = Math.floor(Math.random() * cols);
    if (!board[r][c].mine) {
      board[r][c].mine = true;
      minesPlaced++;
    }
  }
  
  // Считаем количество мин вокруг каждой клетки
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

// Рекурсивное открытие клеток (если вокруг нет мин)
function revealCell(game, r, c) {
  const cell = game.board[r][c];
  if (cell.revealed) return;
  cell.revealed = true;
  // Если клетка не содержит мин и вокруг ноль мин, открываем соседей
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

// Проверка победы: выигрыш, если открыты все клетки без мин
function isWin(game) {
  for (let r = 0; r < game.rows; r++) {
    for (let c = 0; c < game.cols; c++) {
      const cell = game.board[r][c];
      if (!cell.mine && !cell.revealed) return false;
    }
  }
  return true;
}

// Рендер игрового поля в виде inline-клавиатуры
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
      // Формируем callback_data в формате: cell_ряд_столбец
      row.push(Markup.button.callback(text, `cell_${r}_${c}`));
    }
    keyboard.push(row);
  }
  return Markup.inlineKeyboard(keyboard);
}

// Команда /start: запуск новой игры
bot.start(ctx => {
  const chatId = ctx.chat.id;
  const game = createGame(GAME_ROWS, GAME_COLS, MINE_COUNT);
  games[chatId] = game;
  ctx.reply('Добро пожаловать в Сапёр! Выберите клетку:', renderBoard(game));
});

// Команда /new: начать новую игру
bot.command('new', ctx => {
  const chatId = ctx.chat.id;
  const game = createGame(GAME_ROWS, GAME_COLS, MINE_COUNT);
  games[chatId] = game;
  ctx.reply('Новая игра. Выберите клетку:', renderBoard(game));
});

// Обработка нажатий кнопок (callback_query)
bot.on('callback_query', async ctx => {
  const chatId = ctx.chat.id;
  const game = games[chatId];
  if (!game || game.over) {
    return ctx.answerCbQuery('Игра окончена. Введите /new для новой игры.');
  }
  const data = ctx.callbackQuery.data;
  // Ожидаем формат: cell_ряд_столбец
  const parts = data.split('_');
  if (parts[0] === 'cell') {
    const r = parseInt(parts[1], 10);
    const c = parseInt(parts[2], 10);
    const cell = game.board[r][c];
    if (cell.revealed) {
      return ctx.answerCbQuery('Эта клетка уже открыта.');
    }
    if (cell.mine) {
      // Если попали на мину – проигрыш
      cell.revealed = true;
      game.over = true;
      await ctx.editMessageReplyMarkup(renderBoard(game, true).reply_markup);
      ctx.answerCbQuery('💥 Вы проиграли!');
      ctx.reply('💥 Игра окончена. Введите /new для новой игры.');
    } else {
      revealCell(game, r, c);
      if (isWin(game)) {
        game.over = true;
        game.win = true;
        await ctx.editMessageReplyMarkup(renderBoard(game, true).reply_markup);
        ctx.answerCbQuery('🎉 Вы выиграли!');
        ctx.reply('🎉 Поздравляем, вы выиграли! Введите /new для новой игры.');
      } else {
        await ctx.editMessageReplyMarkup(renderBoard(game).reply_markup);
        ctx.answerCbQuery();
      }
    }
  }
});

bot.launch().then(() => {
  console.log('Бот запущен...');
});

// Обработка сигналов завершения
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
