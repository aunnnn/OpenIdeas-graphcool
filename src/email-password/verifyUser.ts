import { fromEvent, FunctionEvent } from 'graphcool-lib'
import { GraphQLClient } from 'graphql-request'

interface EventData {
  verificationCode: string
}

export default async (event: FunctionEvent<EventData>) => {
  console.log(event)
  try {    
    const verificationCode = event.data.verificationCode

    const graphcool = fromEvent(event)
    const api = graphcool.api('simple/v1')
    

    let userId;
    try {
      userId = await getUserFromVerificationCode(api, verificationCode)
    } catch (err) {
      return {
        error: 'Unknown verification code.'
      }
    }
    
    const { updateUser: { username } } = await verifyUser(api, userId)
    return {
      data: {
        username,
      },
    }
  } catch (e) {
    console.log(e)
    return { error: 'An unexpected error occured on account verification' }
  }
}

async function getUserFromVerificationCode(api: GraphQLClient, verificationCode: string): Promise<string> {
  const query = `
    query getUser($verificationCode: String!) {
      User(verificationCode: $verificationCode) {
        id
      }
    }
  `

  const variables = {
    verificationCode,
  }
  return api.request<{ User }>(query, variables).then(u => u.User.id)
}
async function verifyUser(api: GraphQLClient, userId: string): Promise<{ updateUser }> {

  const mutation = `
    mutation verifyUser($id: ID!) {
      updateUser(
        id: $id,
        isAccountVerified: true,
        verificationCode: null,
      ) {
        username
      }
    }
  `
  const variables = {
    id: userId,
  }
  return api.request<{ updateUser }>(mutation, variables)
}