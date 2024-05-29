import React from 'react';
import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
import './App.css';
import 'flowbite';
import { Navbar, Button, Label, TextInput, FileInput } from 'flowbite-react';
import Home from './Home';
import SignIn from './SignIn'; 
import axios from 'axios';

/** App entry-point. Create the router and routes. */
function App() {
  return (
    <Router>
      <div className="App">
      <Navbar fluid rounded>
      <Navbar.Brand href="#">
        <img src="https://seeklogo.com/images/A/a-letter-logo-322D0A4EA7-seeklogo.com.png" className="mr-3 h-6 sm:h-9" alt="Fovus Technologies" />
        <span className="self-center whitespace-nowrap text-xl font-semibold dark:text-white">Fovus - App Demo</span>
      </Navbar.Brand>
      <div className="flex md:order-2">
        <Button color="blue" href="/SignIn" >Sign In</Button>
        <Navbar.Toggle />
      </div>
      <Navbar.Collapse>
        <Navbar.Link href="#" active>
          Home
        </Navbar.Link>
        <Navbar.Link href="#">Sign In</Navbar.Link>
      </Navbar.Collapse>
    </Navbar>

        <Routes>
          <Route exact path="/" element={<Home />} />
          <Route path="/signin" element={<SignIn />} />
        </Routes>
      </div>
    </Router>
  );
}


export default App;
