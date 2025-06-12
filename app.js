// jshint esversion:6

const express = require("express");
const bodyParser = require("body-parser");
const mongoose = require("mongoose");
const { name } = require("ejs");
const _ = require("lodash"); // for dynamic routes

const app = express();


app.set('view engine', 'ejs');
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static("public")); 

mongoose.connect("mongodb+srv://admin-Piyus:Test123@cluster0.pllntec.mongodb.net/todolistDB?retryWrites=true&w=majority&appName=Cluster0");

//create a schema for the items 
const itemsSchema = {
  name: String
};

const listSchema = {
  name: String,
  items: [itemsSchema]
};

const Item = mongoose.model("item", itemsSchema);
const List = mongoose.model("list", listSchema);

const item1 = new Item({
  name: "Hello There"
});
const item2 = new Item({
  name: "Welcome to my site"
});
const item3 = new Item({
  name: "Created By Your One and Only Piyus"
});

const defaultItems = [item1, item2, item3];


//GET function for home route
app.get("/", function (req, res) {
  Item.find()
    .then(items => {
      if (items.length === 0) {
        Item.insertMany(defaultItems).then(result => { console.log("Successfully") })
          .catch(err => { console.log(err) });
        res.redirect("/");
      } else {
        res.render("list", { listTitle: "Today", newListItems: items });
      }
    })
    .catch(err => {
      console.log(err); // error
    });


});
//POST function for home route
app.post("/", function (req, res) {
  // console.log(req.body);
  const itemContent = req.body.newItem;
  const listName = req.body.list;

  const item = new Item({
    name: itemContent
  });

  if (listName === "Today") {
    item.save();
    res.redirect("/");
  } else {
    List.findOne({ name: listName })
      .then(foundList => {
        {
          foundList.items.push(item);
          foundList.save();
          res.redirect("/" + listName);
        }
      })
      .catch(err => {
      console.log(err); // error
    });
  }

});

app.get("/:customListName", function (req, res) {
  const customListName = _.capitalize(req.params.customListName);
  List.findOne({ name: customListName })
    .then(foundList => {
      if (!foundList) {
        console.log("created a New site");
        const list = new List({
          name: customListName,
          items: defaultItems
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

app.post("/delete", function(req, res) {
  const checkedItemId = req.body.checkbox;
  const listName = req.body.listName;

  if (listName === "Today") {
    Item.findByIdAndDelete(checkedItemId)
      .then(() => {
        console.log("Successfully deleted checked item.");
        res.redirect("/");
      })
      .catch(err => console.error(err));
  } else {
    List.findOneAndUpdate(
      { name: listName },
      { $pull: { items: { _id: checkedItemId } } }
    )
      .then(() => {
        res.redirect("/" + listName);
      })
      .catch(err => console.error(err));
  }
});


//GET function for About route

app.get("/about", function (req, res) {
  res.render("about");
});


app.listen(5000, function () {
  console.log("Server is running on port 5000");
});
