<?php /* Smarty version 2.6.18, created on 2025-11-24 18:07:14
         compiled from campaign-zone-panel-filters.html */ ?>
<?php require_once(SMARTY_CORE_DIR . 'core.load_plugins.php');
smarty_core_load_plugins(array('plugins' => array(array('function', 't', 'campaign-zone-panel-filters.html', 14, false),)), $this); ?>

<label class="filter search-filter">
  <?php echo $this->_plugins['function']['t'][0](['str' => 'ZonesSearch'], $this);?>
<br />
  <input id="quick-search-<?php echo $this->_tpl_vars['panelId']; ?>
" class="quick-search" type="text" title="<?php echo $this->_plugins['function']['t'][0](['str' => 'ZonesSearchTitle'], $this);?>
" />
</label>