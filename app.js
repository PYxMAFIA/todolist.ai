// jshint esversion:6

const express = require("express");
const bodyParser = require("body-parser");
const mongoose = require("mongoose");
const _ = require("lodash");

const app = express();

app.set("view engine", "ejs");
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static("public"));

mongoose.connect("mongodb+srv://admin-Piyus:Test123@cluster0.pllntec.mongodb.net/todolistDB?retryWrites=true&w=majority&appName=Cluster0");

// Schema setup
const itemsSchema = { name: String };
const listSchema = {
  name: String,
  items: [itemsSchema]
};

const Item = mongoose.model("Item", itemsSchema);
const List = mongoose.model("List", listSchema);

// ✅ Define globally to use in both / and /:customListName
const defaultItems = [
  { name: "Welcome to your to-do list!" },
  { name: "Hit the ➕ button to add a new item." },
  { name: "<--◻️ Hit this to delete an item." }
];



// Home route
app.get("/", function (req, res) {
  Item.find({})
    .then(function (foundItems) {
      if (foundItems.length === 0) {
        return Item.insertMany(defaultItems).then(() => {
          console.log("Inserted default items");
          res.redirect("/");
        });
      } else {
        res.render("list", { listTitle: "Today", newListItems: foundItems });
      }
    })
    .catch(function (err) {
      console.log("Error fetching or inserting items:", err);
    });
});

// Add item
app.post("/", function (req, res) {
  const itemContent = req.body.newItem;
  const listName = req.body.list;

  const item = new Item({ name: itemContent });

  if (listName === "Today") {
    item.save();
    res.redirect("/");
  } else {
    List.findOne({ name: listName })
      .then(foundList => {
        foundList.items.push(item);
        foundList.save();
        res.redirect("/" + listName);
      })
      .catch(err => console.log(err));
  }
});


// ✅ About route must come BEFORE dynamic route
app.get("/about", function (req, res) {
  console.log("About page accessed");
  res.render("about");
});


// ✅ Dynamic custom list route
app.get("/:customListName", function (req, res) {
  const customListName = _.capitalize(req.params.customListName);

  List.findOne({ name: customListName })
    .then(foundList => {
      if (!foundList) {
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

// Delete item
app.post("/delete", function (req, res) {
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

// Start server
app.listen(process.env.PORT || 5000, () => {
  console.log("Server is running...");
});
