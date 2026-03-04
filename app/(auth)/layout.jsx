import React from 'react'

const AuthLayout = ({children}) => {
  return (
    <main className='flex flex-row items-center justify-center h-screen'>
        {children}
    </main>
  )
}

export default AuthLayout