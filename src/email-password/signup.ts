import { fromEvent, FunctionEvent } from 'graphcool-lib'
import { GraphQLClient } from 'graphql-request'
import * as bcrypt from 'bcryptjs'
import * as validator from 'validator'

interface User {
  id: string
  username: string
}

interface EventData {
  email: string
  password: string
  username: string
}

interface sendMailgunEmail {
  success: boolean
}

const SALT_ROUNDS = 10

const fs = require('fs')

function readFileAsync(path) {
  return new Promise(function (resolve, reject) {
    fs.readFile(path, 'utf8', function (error, result) {
      if (error) {
        reject(error);
      } else {
        resolve(result);
      }
    });
  });
}

export default async (event: FunctionEvent<EventData>) => {
  console.log(event)

  try {

    const graphcool = fromEvent(event)
    const api = graphcool.api('simple/v1')

    const { email, password, username } = event.data

    if (!validator.isEmail(email)) {
      return { error: 'Not a valid email' }
    }

    if (!username || !/^([a-zA-Z0-9]){4,12}$/.test(username)) {
      return { error: 'Username must be between 4-12 characters of numbers or letters.' }
    }

    // check if user exists already
    const userExists: boolean = await getUser(api, email)
      .then(r => r.User !== null)
    if (userExists) {
      return { error: 'Email already in use' }
    }

    const usernameExists: boolean = await getUserByUsername(api, username)
      .then(r => r.User !== null)
    if (usernameExists) {
      return { error: 'Username already in use' }
    }

    // create password hash
    const salt = bcrypt.genSaltSync(SALT_ROUNDS)
    const hash = await bcrypt.hash(password, SALT_ROUNDS)

    // create new user
    const { id: userId, username: createdUsername } = await createGraphcoolUser(api, email, hash, username)

    // generate node token for new User node
    const token = await graphcool.generateNodeToken(userId, 'User')

    // send confirmation email (not finished yet)
    const confirmationTemplate = await readFileAsync(__dirname + '/email-templates/email-confirm.html')

    const recipientVariables = {}
    recipientVariables[email] = {
      username: username,
    }
    const mailgunSuccess = await sendConfirmationEmail(api, {
      tag: 'confirmation-email',
      from: 'aun@platonos.com',
      to: [email],
      subject: '[Platonos] Please confirm your email',
      text: 'Hi! Please confirm your email',
      html: confirmationTemplate,
      recipientVariables,
    })
    if (!mailgunSuccess) throw 'Cannot send confirmation email.'

    return { data: { id: userId, token, username: createdUsername } }
  } catch (e) {
    console.log(e)
    return { error: 'An unexpected error occured during signup: ' + e}
  }
}

async function sendConfirmationEmail(api: GraphQLClient, variables: { 
  tag: String, 
  from: String, 
  to: [String], 
  subject: String, 
  text: String,
  html: {},
  recipientVariables: {}
}): Promise<boolean> {

  const mutation = `
    mutation sendEmail($tag: String!, $from: String!, $to: [String!]!, $subject: String!, $text: String!, $html: String!, $recipientVariables: Json) {
      sendMailgunEmail (
        tag: $tag,
        from: $from,
        to: $to,
        subject: $subject,
        text: $text,
        html: $html,
        recipientVariables: $recipientVariables
      ) {
        success
      }
    }
  `
  return api.request<{ sendMailgunEmail }>(mutation, variables)
    .then(r => r.sendMailgunEmail.success)
}

async function getUser(api: GraphQLClient, email: string): Promise<{ User }> {
  const query = `
    query getUser($email: String!) {
      User(email: $email) {
        id
      }
    }
  `

  const variables = {
    email,
  }

  return api.request<{ User }>(query, variables)
}

async function getUserByUsername(api: GraphQLClient, username: String): Promise<{ User }> {
  const query = `
    query getUser($username: String!) {
      User(username: $username) {
        id
      }
    }
  `

  const variables = {
    username,
  }

  return api.request<{ User }>(query, variables)
}

async function createGraphcoolUser(api: GraphQLClient, email: string, password: string, username: String): Promise<{ id, username }> {
  const mutation = `
    mutation createGraphcoolUser($email: String!, $password: String!, $username: String!) {
      createUser(
        email: $email,
        password: $password,
        username: $username
      ) {
        id
        username
      }
    }
  `

  const variables = {
    email,
    password: password,
    username: username,
  }

  return api.request<{ createUser: User }>(mutation, variables)
    .then(r => ({ id: r.createUser.id, username: r.createUser.username }))
}
