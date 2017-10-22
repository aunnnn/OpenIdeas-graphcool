import { fromEvent, FunctionEvent } from 'graphcool-lib'
import { GraphQLClient } from 'graphql-request'

interface EventData {
  title: string
  usersIds: [string]
  createdById: string
  invitedUserId: string
  lastestMessagesAt: Date
  stateType: number
}

export default async (event: FunctionEvent<EventData>) => {
  console.log(event)
  const authToken = event.context.auth.token
  try {    
    const createdByUserId = event.data.createdById

    const graphcool = fromEvent(event)
    const api = graphcool.api('simple/v1')
    const numberOfTopicsLeft = await getUserNumberOfTopicsLeft(api, createdByUserId)
    if (!numberOfTopicsLeft || numberOfTopicsLeft <= 0) {
      return { error: 'Today you have no quota left. Please try again tomorrow.' }
    }
    const result = await createChatroom(api, event.data)
    await updateUserNumberOfTopicsLeft(api, createdByUserId, numberOfTopicsLeft - 1)
    return {
      data: result.createChatroom,
    }
  } catch (e) {
    console.log(e)
    return { error: 'An unexpected error occured on new chat' }
  }
}

async function getUserNumberOfTopicsLeft(api: GraphQLClient, userId: string): Promise<number> {
  const query = `
    query getUser($id: ID!) {
      User(id: $id) {
        numberOfTopicsLeft
      }
    }
  `
  const variables = {
    id: userId,
  }
  return api.request<{ User }>(query, variables).then(u => u.User.numberOfTopicsLeft)
}

async function updateUserNumberOfTopicsLeft(api: GraphQLClient, userId: string, numberOfTopicsLeft: number): Promise<{ User }> {
  const mutation = `
    mutation updateNumberOfTopicsLeft($id: ID!, $numberOfTopicsLeft: Int!) {
      updateUser(
        id: $id,
        numberOfTopicsLeft: $numberOfTopicsLeft,
      ) {
        id
      }
    }
  `
  const variables = {
    id: userId,
    numberOfTopicsLeft,
  }
  return api.request<{ User }>(mutation, variables)
}

async function createChatroom(api: GraphQLClient, variables: {}): Promise<{ createChatroom }> {

  const mutation = `
    mutation CreateChatroomMutation($title: String!, $createdById: ID!, $usersIds: [ID!]!, $invitedUserId: ID!, $latestMessagesAt: DateTime!, $stateType: Int!) {
      createChatroom(
        title: $title, 
        usersIds: $usersIds, 
        createdById: $createdById, 
        stateType: $stateType,
        invitedUserId: $invitedUserId,
        latestMessagesAt: $latestMessagesAt,
      ) {
        id
        title
        createdAt
        _messagesMeta {
          count
        }
        users {
          id
        }
        invitedUser {
          id
        }
        createdBy {
          id
        }
        stateType
        latestMessagesAt
        deniedByUserIds
      }
    }
  `
  return api.request<{ createChatroom }>(mutation, variables)
}