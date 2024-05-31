import React, { useState } from 'react';
//import { CognitoUserPool, CognitoUser, AuthenticationDetails } from 'amazon-cognito-identity-js';
import { useNavigate } from 'react-router-dom';
import 'flowbite';
import { Navbar, Button} from 'flowbite-react';


/** Simple sign-in component to integrate Cognito later on. Just a front-end 
 * for now, will be used for Cognito later.
 */
//const userPool = new CognitoUserPool(poolData);

const SignIn = ({ onSignIn }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const navigate = useNavigate(); // Initialize useNavigate
  const handleSubmit = (event) => {
    //console.log('in handle submit');
    event.preventDefault();


    if (!username || !password) {
        setError('Please enter both username and password.');
        return;
      }

    alert('This sign-in component is front-end only for now! Navigate back to the main page.');
    navigate('/');
    // const user = new CognitoUser({
    //   Username: username,
    //   Pool: userPool,
    // });

    // const authDetails = new AuthenticationDetails({
    //   Username: username,
    //   Password: password,
    // });

    // user.authenticateUser(authDetails, {
    //   onSuccess: (result) => {
    //     console.log('Authentication successful');
    //     const token = result.getIdToken().getJwtToken();
    //     console.log('we got a token! ' + JSON.stringify(token));
    //     onSignIn(token);

    //   },
    //   onFailure: (err) => {
    //     console.error('Authentication failed', err);
    //   },
    // });
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen py-2">
      <form onSubmit={handleSubmit} className="w-full max-w-sm">
        <div className="mb-4">
          <label className="block text-gray-700 text-sm font-bold mb-2" htmlFor="username">
            Username
          </label>
          <input
            type="text"
            id="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
            className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
          />
        </div>
        <div className="mb-6">
          <label className="block text-gray-700 text-sm font-bold mb-2" htmlFor="password">
            Password
          </label>
          <input
            type="password"
            id="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
          />
        </div>
        <div className="flex items-center justify-between">
          <button
            type="submit"
            className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline"
          >
            Sign In
          </button>
        </div>
      </form>
    </div>
  );
};

export default SignIn;
