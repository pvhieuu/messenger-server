import { Response } from 'express'
import { ICreateMessageDto, TYPE_MESSAGE } from '../interfaces'
import { ICradle } from '../container'
import { MESSAGE_EMOJIS } from '../constants'
import _ from 'lodash'

export const messageController = ({ helpers, services, cache }: ICradle) => {
  const { responseHelper, cacheHelper } = helpers
  const { chatService, messageService } = services

  const sendMessage = async (req: any, res: Response) => {
    const content = _.trim(req.body.content)
    const type = _.trim(req.body.type) as TYPE_MESSAGE
    const chatId = _.trim(req.body.chat_id)
    const guestId = _.trim(req.body.guest_id)
    let guestChatId = req.body.guest_chat_id?.trim() || null
    const nicknameHost = req.body.nickname_host?.trim() || null
    const nicknameGuest = req.body.nickname_guest?.trim() || null
    const color = req.body.color
    const emoji = req.body.emoji
    const backgroundColor = req.body.background_color
    if (
      !content ||
      ![
        TYPE_MESSAGE.TEXT,
        TYPE_MESSAGE.ICON,
        TYPE_MESSAGE.IMAGE,
        TYPE_MESSAGE.VOICE,
        TYPE_MESSAGE.VIDEO,
        TYPE_MESSAGE.CONFIG,
      ].includes(type) ||
      !chatId ||
      !guestId
    )
      return responseHelper.badRequest(res, 'Invalid data!')
    if (guestId === req.userId)
      return responseHelper.badRequest(res, 'Cannot send message!')
    try {
      let newGuestChat = null
      if (_.isNil(guestChatId)) {
        newGuestChat = await chatService.createOne({
          host_id: guestId,
          guest_id: req.userId,
          guest_chat_id: chatId,
          readed: true,
          nickname_host: nicknameGuest,
          nickname_guest: nicknameHost,
          color,
          background_color: backgroundColor,
          emoji,
        })
        guestChatId = newGuestChat.id
        await chatService.updateOneGuestChatId(newGuestChat.id, chatId)
      }
      const createNewMessage = (chat_id: string): ICreateMessageDto => ({
        content,
        type,
        sender_id: req.userId,
        receiver_id: guestId,
        chat_id,
        guest_message_id: null,
      })
      const newMessage = await messageService.createOne(
        createNewMessage(chatId),
      )
      const newGuestMessage = await messageService.createOne(
        createNewMessage(guestChatId),
      )
      await messageService.udpateOneGuestMessageId(
        newGuestMessage.id,
        newMessage.id,
      )
      await messageService.udpateOneGuestMessageId(
        newMessage.id,
        newGuestMessage.id,
      )
      await chatService.updateOneLastMessageTime(
        newMessage.created_at as Date,
        chatId,
      )
      await chatService.updateOneLastMessageTime(
        newGuestMessage.created_at as Date,
        guestChatId,
      )
      await chatService.updateOneReaded(guestChatId, false)
      await cache.delCacheByPattern(cacheHelper.listMessagesOfChat(chatId))
      await cache.delCacheByPattern(cacheHelper.listMessagesOfChat(guestChatId))
      await cache.delCache(cacheHelper.listChatsOfUser(req.userId))
      await cache.delCache(cacheHelper.listChatsOfUser(guestId))
      newGuestChat =
        newGuestChat && (await chatService.findOneById(newGuestChat.id))
      return responseHelper.responseSuccess(res, 'Send message successfully', {
        new_message: newMessage,
        new_guest_message: newGuestMessage,
        new_guest_chat: newGuestChat,
      })
    } catch (error) {
      console.log(error)
      return responseHelper.internalServerError(res)
    }
  }

  const getListMessages = async (req: any, res: Response) => {
    const chatId = req.query.chat_id?.trim() || null
    const page: number = req.query.page
    try {
      let listMessages = await cache.getCache(
        cacheHelper.listMessagesOfChatOfPage(chatId, page),
      )
      if (listMessages === null) {
        listMessages = await messageService.findByChatId(chatId, page)
        await cache.setCache(
          cacheHelper.listMessagesOfChatOfPage(chatId, page),
          listMessages,
        )
      }
      return responseHelper.responseSuccess(
        res,
        'Get list messages successfully',
        { list_messages: listMessages },
      )
    } catch (error) {
      console.log(error)
      return responseHelper.internalServerError(res)
    }
  }

  const updateEmoji = async (req: any, res: Response) => {
    const emoji = req.body.emoji?.trim() || null
    const messageId = req.body.message_id?.trim()
    const guestMessageId = req.body.guest_message_id?.trim() || null
    const chatId = req.body.chat_id?.trim() || null
    const guestChatId = req.body.guest_chat_id?.trim() || null
    if (!MESSAGE_EMOJIS.includes(emoji))
      return responseHelper.badRequest(res, 'Invalid emoji!')
    try {
      await messageService.updateOneEmoji(emoji, messageId)
      await messageService.updateOneEmoji(emoji, guestMessageId)
      await cache.delCacheByPattern(cacheHelper.listMessagesOfChat(chatId))
      await cache.delCacheByPattern(cacheHelper.listMessagesOfChat(guestChatId))
      return responseHelper.responseSuccess(res, 'Update emoji successfully', {
        emoji,
        message_id: messageId,
        guest_message_id: guestMessageId,
      })
    } catch (error) {
      console.log(error)
      return responseHelper.internalServerError(res)
    }
  }

  return {
    sendMessage,
    getListMessages,
    updateEmoji,
  }
}
