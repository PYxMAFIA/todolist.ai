// jshint esversion:6
require('dotenv').config();

const express = require("express");
const bodyParser = require("body-parser");
const mongoose = require("mongoose");
const _ = require("lodash");
const session = require("express-session");
const passport = require("passport");
const passportLocalMongoose = require("passport-local-mongoose");
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const findOrCreate = require('mongoose-findorcreate');
const MongoStore = require('connect-mongo');
const LocalStrategy = require('passport-local').Strategy;

const app = express();

app.set("view engine", "ejs");
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static("public"));

// Session setup
app.use(session({
  secret: process.env.SESSION_SECRET || "Our little secret.",
  resave: true,
  saveUninitialized: true,
  store: MongoStore.create({
    mongoUrl: process.env.MONGODB_URI || "mongodb+srv://admin-Piyus:Test123@cluster0.pllntec.mongodb.net/todolistDB?retryWrites=true&w=majority&appName=Cluster0",
    ttl: 24 * 60 * 60 // 1 day
  }),
  cookie: {
    maxAge: 24 * 60 * 60 * 1000 // 1 day
  }
}));

app.use(passport.initialize());
app.use(passport.session());

// Add this after session setup
app.use(function(req, res, next) {
  res.locals.user = req.user;
  next();
});

mongoose.connect(process.env.MONGODB_URI || "mongodb+srv://admin-Piyus:Test123@cluster0.pllntec.mongodb.net/todolistDB?retryWrites=true&w=majority&appName=Cluster0");

// Schema setup
const userSchema = new mongoose.Schema({
  email: String,
  password: String,
  googleId: String,
  username: {
    type: String,
    sparse: true,
    unique: true
  }
});

userSchema.plugin(passportLocalMongoose, {
  usernameField: 'email',
  usernameUnique: false
});
userSchema.plugin(findOrCreate);

const itemsSchema = { name: String };
const listSchema = {
  name: String,
  items: [itemsSchema],
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User"
  }
};

const User = mongoose.model("User", userSchema);
const Item = mongoose.model("Item", itemsSchema);
const List = mongoose.model("List", listSchema);

// Add passport serialization
passport.serializeUser(function(user, done) {
  done(null, user.id);
});

passport.deserializeUser(function(id, done) {
  User.findById(id)
    .then(user => {
      done(null, user);
    })
    .catch(err => {
      done(err, null);
    });
});

// Update the local strategy
passport.use(new LocalStrategy({
  usernameField: 'email',
  passwordField: 'password'
}, function(email, password, done) {
  User.findOne({ email: email })
    .then(user => {
      if (!user) {
        return done(null, false, { message: 'Incorrect email.' });
      }
      user.authenticate(password, function(err, user) {
        if (err) {
          return done(err);
        }
        if (!user) {
          return done(null, false, { message: 'Incorrect password.' });
        }
        return done(null, user);
      });
    })
    .catch(err => done(err));
}));

const isProduction = process.env.NODE_ENV === 'production';
const callbackURL = isProduction 
  ? "https://todolist-ai.onrender.com/auth/google/callback"
  : "http://localhost:5000/auth/google/callback";

console.log("Google OAuth Configuration:");
console.log("Callback URL:", callbackURL);
console.log("Client ID:", process.env.GOOGLE_CLIENT_ID ? "Set" : "Not set");
console.log("Client Secret:", process.env.GOOGLE_CLIENT_SECRET ? "Set" : "Not set");

passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: callbackURL,
    userProfileURL: "https://www.googleapis.com/oauth2/v3/userinfo"
  },
  async function(accessToken, refreshToken, profile, cb) {
    try {
      console.log("Google profile received:", profile.id);
      let user = await User.findOne({ googleId: profile.id });
      
      if (!user) {
        console.log("Creating new user for Google ID:", profile.id);
        const email = profile.emails && profile.emails[0] ? profile.emails[0].value : `${profile.id}@google.com`;
        user = await User.create({
          googleId: profile.id,
          email: email
        });
      }
      
      return cb(null, user);
    } catch (err) {
      console.log("Google Strategy Error:", err);
      return cb(err, null);
    }
  }
));

app.post("/register", function(req, res) {
  const { username, password } = req.body;
  
  User.findOne({ email: username })
    .then(existingUser => {
      if (existingUser) {
        console.log("User already exists");
        return res.redirect("/register");
      }
      
      const newUser = new User({ email: username });
      User.register(newUser, password, function(err, user) {
        if (err) {
          console.log("Registration error:", err);
          return res.redirect("/register");
        }
        req.login(user, function(err) {
          if (err) {
            console.log("Login after registration error:", err);
            return res.redirect("/login");
          }
          return res.redirect("/");
        });
      });
    })
    .catch(err => {
      console.log("Error during registration:", err);
      res.redirect("/register");
    });
});

app.post("/login", function(req, res) {
  const { username, password } = req.body;
  
  User.findOne({ email: username })
    .then(user => {
      if (!user) {
        return res.redirect("/login");
      }
      
      user.authenticate(password, function(err, user) {
        if (err || !user) {
          return res.redirect("/login");
        }
        
        req.login(user, function(err) {
          if (err) {
            console.log("Login error:", err);
            return res.redirect("/login");
          }
          return res.redirect("/");
        });
      });
    })
    .catch(err => {
      console.log("Error during login:", err);
      res.redirect("/login");
    });
});

// Middleware to check if user is authenticated
function isAuthenticated(req, res, next) {
  if (req.isAuthenticated()) {
    return next();
  }
  res.redirect("/login");
}

// Public routes (no authentication required)
app.get("/login", function(req, res) {
  if (req.isAuthenticated()) {
    return res.redirect("/");
  }
  res.render("login");
});

app.get("/register", function(req, res) {
  if (req.isAuthenticated()) {
    return res.redirect("/");
  }
  res.render("register");
});

app.get("/logout", function(req, res) {
  req.logout(function(err) {
    if (err) {
      console.log(err);
    }
    res.redirect("/login");
  });
});

// Protected routes (require authentication)
app.get("/", isAuthenticated, function(req, res) {
  List.findOne({ name: "Today", userId: req.user._id })
    .then(function(foundList) {
      if (!foundList) {
        const list = new List({
          name: "Today",
          items: defaultItems,
          userId: req.user._id
        });
        return list.save().then(() => {
          res.redirect("/");
        });
      } else {
        res.render("list", { listTitle: "Today", newListItems: foundList.items });
      }
    })
    .catch(function(err) {
      console.log("Error finding or creating list:", err);
    });
});

// Add item
app.post("/", isAuthenticated, function (req, res) {
  const itemContent = req.body.newItem;
  const listName = req.body.list;

  const item = new Item({ name: itemContent });

  if (listName === "Today") {
    List.findOne({ name: "Today", userId: req.user._id })
      .then(foundList => {
        foundList.items.push(item);
        foundList.save();
        res.redirect("/");
      })
      .catch(err => console.log(err));
  } else {
    List.findOne({ name: listName, userId: req.user._id })
      .then(foundList => {
        foundList.items.push(item);
        foundList.save();
        res.redirect("/" + listName);
      })
      .catch(err => console.log(err));
  }
});

// About route must come BEFORE dynamic route
app.get("/about", function (req, res) {
  res.render("about");
});

// Dynamic custom list route
app.get("/:customListName", isAuthenticated, function (req, res) {
  const customListName = _.capitalize(req.params.customListName);

  List.findOne({ name: customListName, userId: req.user._id })
    .then(foundList => {
      if (!foundList) {
        const list = new List({
          name: customListName,
          items: defaultItems,
          userId: req.user._id
        });

        return list.save().then(() => {
          res.redirect("/" + customListName);
        });
      } else {
        res.render("list", {
          listTitle: foundList.name,
          newListItems: foundList.items
        });
      }
    })
    .catch(err => {
      console.log("Error finding list:", err);
      res.redirect("/");
    });
});

// Delete item
app.post("/delete", isAuthenticated, function (req, res) {
  const checkedItemId = req.body.checkbox;
  const listName = req.body.listName;

  if (listName === "Today") {
    List.findOneAndUpdate(
      { name: "Today", userId: req.user._id },
      { $pull: { items: { _id: checkedItemId } } }
    )
      .then(() => {
        res.redirect("/");
      })
      .catch(err => console.error(err));
  } else {
    List.findOneAndUpdate(
      { name: listName, userId: req.user._id },
      { $pull: { items: { _id: checkedItemId } } }
    )
      .then(() => {
        res.redirect("/" + listName);
      })
      .catch(err => console.error(err));
  }
});

// Google OAuth Routes
app.get("/auth/google",
  passport.authenticate("google", { 
    scope: ["profile", "email"],
    prompt: "select_account"
  })
);

app.get("/auth/google/callback", 
  passport.authenticate("google", { 
    failureRedirect: "/login",
    failureMessage: true 
  }),
  function(req, res) {
    try {
      res.redirect("/");
    } catch (err) {
      console.error("Callback error:", err);
      res.redirect("/login");
    }
  }
);

// ✅ Define globally to use in both / and /:customListName
const defaultItems = [
  { name: "Welcome to your to-do list!" },
  { name: "Hit the ➕ button to add a new item." },
  { name: "<--◻️ Hit this to delete an item." }
];

// Add this before the app.listen() call
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).send('Something broke!');
});

// Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}...`);
});
